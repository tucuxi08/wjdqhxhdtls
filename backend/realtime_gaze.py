# realtime_gaze.py
import cv2
import torch
import numpy as np
import mediapipe as mp
from model import GazeNet

class GazeEstimator:
    def __init__(self, model_path='best_model.pth'):
        # 모델 로드
        self.model = GazeNet()
        self.model.load_state_dict(torch.load(model_path, map_location='cpu'))
        self.model.eval()
        
        # MediaPipe 얼굴 메쉬 초기화
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,  # 눈 주변 상세 랜드마크
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        # 눈 랜드마크 인덱스 (MediaPipe 기준)
        # 왼쪽 눈
        self.LEFT_EYE = [362, 385, 387, 263, 373, 380]
        # 오른쪽 눈
        self.RIGHT_EYE = [33, 160, 158, 133, 153, 144]
    
    def get_eye_rect(self, landmarks, eye_indices, frame_shape):
        """눈 랜드마크에서 bounding box 추출"""
        h, w = frame_shape[:2]
        points = []
        for idx in eye_indices:
            x = int(landmarks[idx].x * w)
            y = int(landmarks[idx].y * h)
            points.append((x, y))
        
        points = np.array(points)
        x_min, y_min = points.min(axis=0)
        x_max, y_max = points.max(axis=0)
        
        # 여유 공간 추가
        padding_w = int((x_max - x_min) * 0.3)
        padding_h = int((y_max - y_min) * 0.5)
        
        x_min = max(0, x_min - padding_w)
        y_min = max(0, y_min - padding_h)
        x_max = min(w, x_max + padding_w)
        y_max = min(h, y_max + padding_h)
        
        return x_min, y_min, x_max, y_max
    
    def preprocess_eye(self, eye_img):
        """눈 이미지 전처리 (36x60 grayscale)"""
        # Grayscale 변환
        if len(eye_img.shape) == 3:
            eye_img = cv2.cvtColor(eye_img, cv2.COLOR_BGR2GRAY)
        
        # 리사이즈 (36x60)
        eye_img = cv2.resize(eye_img, (60, 36))
        
        # 정규화 & 텐서 변환
        eye_img = eye_img.astype(np.float32) / 255.0
        eye_tensor = torch.from_numpy(eye_img).unsqueeze(0).unsqueeze(0)  # (1, 1, 36, 60)
        
        return eye_tensor
    
    def predict_gaze(self, eye_tensor):
        """시선 방향 예측"""
        with torch.no_grad():
            gaze = self.model(eye_tensor)
        return gaze.numpy()[0]  # (3,) 벡터
    
    def run(self):
        """웹캠 실시간 추론"""
        cap = cv2.VideoCapture(0)
        
        print("웹캠 시작! 'q' 누르면 종료")
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            frame = cv2.flip(frame, 1)  # 좌우 반전
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # 얼굴 검출
            results = self.face_mesh.process(rgb_frame)
            
            if results.multi_face_landmarks:
                landmarks = results.multi_face_landmarks[0].landmark
                
                # 양쪽 눈 처리
                for eye_name, eye_indices in [('Left', self.LEFT_EYE), ('Right', self.RIGHT_EYE)]:
                    # 눈 영역 추출
                    x1, y1, x2, y2 = self.get_eye_rect(landmarks, eye_indices, frame.shape)
                    eye_img = frame[y1:y2, x1:x2]
                    
                    if eye_img.size == 0:
                        continue
                    
                    # 전처리 & 추론
                    eye_tensor = self.preprocess_eye(eye_img)
                    gaze = self.predict_gaze(eye_tensor)
                    
                    # 시각화: 눈 박스
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    
                    # 시각화: 시선 방향 화살표
                    eye_center = ((x1 + x2) // 2, (y1 + y2) // 2)
                    arrow_len = 50
                    end_point = (
                        int(eye_center[0] + gaze[0] * arrow_len),
                        int(eye_center[1] - gaze[1] * arrow_len)  # y축 반전
                    )
                    cv2.arrowedLine(frame, eye_center, end_point, (0, 0, 255), 2)
                    
                    # 시선 값 표시
                    text = f"{eye_name}: ({gaze[0]:.2f}, {gaze[1]:.2f}, {gaze[2]:.2f})"
                    y_offset = 30 if eye_name == 'Left' else 60
                    cv2.putText(frame, text, (10, y_offset), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            cv2.imshow('Gaze Estimation', frame)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    estimator = GazeEstimator()
    estimator.run()