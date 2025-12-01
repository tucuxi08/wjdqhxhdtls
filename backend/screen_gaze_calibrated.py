# screen_gaze_robust.py
import cv2
import torch
import numpy as np
import mediapipe as mp
from model import GazeNet
import screeninfo
from collections import deque

class RobustGazeTracker:
    def __init__(self, model_path='best_model.pth'):
        self.model = GazeNet()
        self.model.load_state_dict(torch.load(model_path, map_location='cpu'))
        self.model.eval()
        
        screen = screeninfo.get_monitors()[0]
        self.screen_w = screen.width
        self.screen_h = screen.height
        
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        self.LEFT_EYE = [362, 385, 387, 263, 373, 380]
        self.RIGHT_EYE = [33, 160, 158, 133, 153, 144]
        
        # 캘리브레이션 데이터
        self.calib_gazes = []
        self.calib_points = []
        self.is_calibrated = False
        
        # 변환 행렬 (x, y 각각)
        self.transform_x = None
        self.transform_y = None
        
        # 스무딩
        self.ema_x = None
        self.ema_y = None
        
        self.cap = None
    
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
    
    def get_current_gaze(self, frame):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb_frame)
        
        if not results.multi_face_landmarks:
            return None
        
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
            return np.mean(gazes, axis=0)
        return None
    
    def collect_gaze_robust(self, n=30):
        """n개 샘플, 이상치 제거 후 평균"""
        samples = []
        for _ in range(n):
            ret, frame = self.cap.read()
            frame = cv2.flip(frame, 1)
            gaze = self.get_current_gaze(frame)
            if gaze is not None:
                samples.append(gaze)
        
        if len(samples) < 10:
            return None
        
        samples = np.array(samples)
        
        # 각 축별 이상치 제거 (상하위 10% 제거)
        result = []
        for axis in range(3):
            values = samples[:, axis]
            lower = np.percentile(values, 10)
            upper = np.percentile(values, 90)
            filtered = values[(values >= lower) & (values <= upper)]
            result.append(filtered.mean() if len(filtered) > 0 else values.mean())
        
        return np.array(result)
    
    def calibrate(self):
        if self.cap is None:
            self.cap = cv2.VideoCapture(0)
        
        margin = 80
        
        # 5x5 = 25포인트 그리드
        rows, cols = 5, 5
        points = []
        for r in range(rows):
            for c in range(cols):
                px = margin + c * (self.screen_w - 2 * margin) // (cols - 1)
                py = margin + r * (self.screen_h - 2 * margin) // (rows - 1)
                points.append((px, py))
        
        cv2.namedWindow('Calibration', cv2.WND_PROP_FULLSCREEN)
        cv2.setWindowProperty('Calibration', cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
        
        self.calib_gazes = []
        self.calib_points = []
        
        for i, (px, py) in enumerate(points):
            # 3초 카운트다운 + 자동 수집
            for countdown in range(3, 0, -1):
                screen = np.zeros((self.screen_h, self.screen_w, 3), dtype=np.uint8)
                cv2.circle(screen, (px, py), 25, (0, 255, 0), -1)
                cv2.circle(screen, (px, py), 30, (255, 255, 255), 3)
                cv2.putText(screen, f"Point {i+1}/{len(points)}: Look at dot... {countdown}", 
                           (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                cv2.imshow('Calibration', screen)
                
                # 1초 대기 (프레임 소비하면서)
                for _ in range(30):
                    ret, frame = self.cap.read()
                    cv2.waitKey(33)
            
            # 데이터 수집
            screen = np.zeros((self.screen_h, self.screen_w, 3), dtype=np.uint8)
            cv2.circle(screen, (px, py), 25, (0, 0, 255), -1)  # 빨간색 = 수집중
            cv2.putText(screen, f"Collecting...", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.imshow('Calibration', screen)
            cv2.waitKey(1)
            
            gaze = self.collect_gaze_robust(30)
            if gaze is not None:
                self.calib_gazes.append(gaze)
                self.calib_points.append([px, py])
                print(f"Point {i+1} OK: gaze={gaze}")
            else:
                print(f"Point {i+1} FAILED")
        
        cv2.destroyWindow('Calibration')
        
        # 변환 행렬 계산
        if len(self.calib_gazes) >= 9:
            self._compute_transform()
            self.is_calibrated = True
            self.ema_x = None
            self.ema_y = None
            print(f"캘리브레이션 완료! ({len(self.calib_gazes)} points)")
            return True
        
        print("캘리브레이션 실패")
        return False
    
    def _compute_transform(self):
        """최소자승법으로 gaze → screen 변환"""
        G = np.array(self.calib_gazes)  # (N, 3)
        P = np.array(self.calib_points)  # (N, 2)
        
        # [gaze_x, gaze_y, gaze_z, 1] → screen_x or screen_y
        G_bias = np.hstack([G, np.ones((G.shape[0], 1))])  # (N, 4)
        
        # 각 축 따로 계산
        self.transform_x, _, _, _ = np.linalg.lstsq(G_bias, P[:, 0], rcond=None)
        self.transform_y, _, _, _ = np.linalg.lstsq(G_bias, P[:, 1], rcond=None)
    
    def gaze_to_screen(self, gaze):
        if not self.is_calibrated:
            return self.screen_w // 2, self.screen_h // 2
        
        gaze_bias = np.append(gaze, 1)
        screen_x = np.dot(gaze_bias, self.transform_x)
        screen_y = np.dot(gaze_bias, self.transform_y)
        
        screen_x = np.clip(screen_x, 0, self.screen_w)
        screen_y = np.clip(screen_y, 0, self.screen_h)
        
        return int(screen_x), int(screen_y)
    
    def smooth_screen(self, x, y):
        if self.ema_x is None:
            self.ema_x = x
            self.ema_y = y
            return x, y
        
        alpha = 0.2
        self.ema_x = alpha * x + (1 - alpha) * self.ema_x
        self.ema_y = alpha * y + (1 - alpha) * self.ema_y
        
        return int(self.ema_x), int(self.ema_y)
    
    def run(self):
        if self.cap is None:
            self.cap = cv2.VideoCapture(0)
        
        cv2.namedWindow('Gaze', cv2.WND_PROP_FULLSCREEN)
        cv2.setWindowProperty('Gaze', cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
        
        print("'c' = 캘리브레이션, 'q' = 종료")
        
        while self.cap.isOpened():
            ret, frame = self.cap.read()
            if not ret:
                break
            
            frame = cv2.flip(frame, 1)
            screen = np.zeros((self.screen_h, self.screen_w, 3), dtype=np.uint8)
            
            gaze = self.get_current_gaze(frame)
            
            if gaze is not None:
                raw_x, raw_y = self.gaze_to_screen(gaze)
                screen_x, screen_y = self.smooth_screen(raw_x, raw_y)
                
                cv2.circle(screen, (screen_x, screen_y), 20, (0, 255, 0), -1)
            
            status = "CALIBRATED" if self.is_calibrated else "Press 'c'"
            cv2.putText(screen, status, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            
            small = cv2.resize(frame, (200, 150))
            screen[20:170, self.screen_w-220:self.screen_w-20] = small
            
            cv2.imshow('Gaze', screen)
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('c'):
                self.calibrate()
        
        self.cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    tracker = RobustGazeTracker()
    tracker.run()