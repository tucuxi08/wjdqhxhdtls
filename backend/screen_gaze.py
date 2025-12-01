# screen_gaze.py
import cv2
import torch
import numpy as np
import mediapipe as mp
from model import GazeNet
import screeninfo

class ScreenGazeTracker:
    def __init__(self, model_path='best_model.pth'):
        # 모델 로드
        self.model = GazeNet()
        self.model.load_state_dict(torch.load(model_path, map_location='cpu'))
        self.model.eval()
        
        # 화면 해상도
        screen = screeninfo.get_monitors()[0]
        self.screen_w = screen.width
        self.screen_h = screen.height
        
        # MediaPipe
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        self.LEFT_EYE = [362, 385, 387, 263, 373, 380]
        self.RIGHT_EYE = [33, 160, 158, 133, 153, 144]
        
        # 스무딩용
        self.gaze_history = []
        self.smoothing = 5
    
    def get_eye_rect(self, landmarks, eye_indices, frame_shape):
        h, w = frame_shape[:2]
        points = []
        for idx in eye_indices:
            x = int(landmarks[idx].x * w)
            y = int(landmarks[idx].y * h)
            points.append((x, y))
        
        points = np.array(points)
        x_min, y_min = points.min(axis=0)
        x_max, y_max = points.max(axis=0)
        
        padding_w = int((x_max - x_min) * 0.3)
        padding_h = int((y_max - y_min) * 0.5)
        
        x_min = max(0, x_min - padding_w)
        y_min = max(0, y_min - padding_h)
        x_max = min(w, x_max + padding_w)
        y_max = min(h, y_max + padding_h)
        
        return x_min, y_min, x_max, y_max
    
    def preprocess_eye(self, eye_img):
        if len(eye_img.shape) == 3:
            eye_img = cv2.cvtColor(eye_img, cv2.COLOR_BGR2GRAY)
        eye_img = cv2.resize(eye_img, (60, 36))
        eye_img = eye_img.astype(np.float32) / 255.0
        eye_tensor = torch.from_numpy(eye_img).unsqueeze(0).unsqueeze(0)
        return eye_tensor
    
    def gaze_to_screen(self, gaze):
        """3D gaze 벡터 → 화면 좌표 변환"""
        # gaze[0] = x방향 (좌우), gaze[1] = y방향 (상하)
        # 간단한 선형 매핑 (캘리브레이션 없이)
        
        scale_x = 2000  # 조절 필요
        scale_y = 1500  # 조절 필요
        
        screen_x = self.screen_w / 2 - gaze[0] * scale_x
        screen_y = self.screen_h / 2 + gaze[1] * scale_y
        
        # 화면 범위 제한
        screen_x = np.clip(screen_x, 0, self.screen_w)
        screen_y = np.clip(screen_y, 0, self.screen_h)
        
        return int(screen_x), int(screen_y)
    
    def smooth_gaze(self, gaze):
        """시선 스무딩 (떨림 방지)"""
        self.gaze_history.append(gaze)
        if len(self.gaze_history) > self.smoothing:
            self.gaze_history.pop(0)
        return np.mean(self.gaze_history, axis=0)
    
    def run(self):
        cap = cv2.VideoCapture(0)
        
        # 전체화면 시선 표시 창
        cv2.namedWindow('Gaze Point', cv2.WND_PROP_FULLSCREEN)
        cv2.setWindowProperty('Gaze Point', cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
        
        print("실행 중! 'q' = 종료, 'c' = 캘리브레이션(미구현)")
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            frame = cv2.flip(frame, 1)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # 검은 화면 (시선 점 표시용)
            screen = np.zeros((self.screen_h, self.screen_w, 3), dtype=np.uint8)
            
            results = self.face_mesh.process(rgb_frame)
            
            if results.multi_face_landmarks:
                landmarks = results.multi_face_landmarks[0].landmark
                
                gazes = []
                for eye_indices in [self.LEFT_EYE, self.RIGHT_EYE]:
                    x1, y1, x2, y2 = self.get_eye_rect(landmarks, eye_indices, frame.shape)
                    eye_img = frame[y1:y2, x1:x2]
                    
                    if eye_img.size == 0:
                        continue
                    
                    eye_tensor = self.preprocess_eye(eye_img)
                    with torch.no_grad():
                        gaze = self.model(eye_tensor).numpy()[0]
                    gazes.append(gaze)
                
                if gazes:
                    # 양쪽 눈 평균
                    avg_gaze = np.mean(gazes, axis=0)
                    smoothed_gaze = self.smooth_gaze(avg_gaze)
                    
                    # 화면 좌표 변환
                    screen_x, screen_y = self.gaze_to_screen(smoothed_gaze)
                    
                    # 시선 점 그리기
                    cv2.circle(screen, (screen_x, screen_y), 30, (0, 255, 0), -1)
                    cv2.circle(screen, (screen_x, screen_y), 35, (255, 255, 255), 3)
                    
                    # 좌표 표시
                    text = f"({screen_x}, {screen_y})"
                    cv2.putText(screen, text, (screen_x + 50, screen_y), 
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            
            cv2.imshow('Gaze Point', screen)
            
            # 웹캠 프리뷰 (작게)
            small_frame = cv2.resize(frame, (320, 240))
            cv2.imshow('Webcam', small_frame)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    tracker = ScreenGazeTracker()
    tracker.run()