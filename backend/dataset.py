
# dataset.py
import os
import numpy as np
import scipy.io as sio
import torch
from torch.utils.data import Dataset, DataLoader

class MPIIGazeDataset(Dataset):
    """
    MPIIGaze 데이터셋 로더
    - 여러 피험자(p00~p14)의 여러 day 파일을 합쳐서 로드
    - 왼쪽/오른쪽 눈 데이터 모두 사용
    """
    
    def __init__(self, data_root, subject_ids=None, eye='both', transform=None):
        """
        Args:
            data_root: Data/Normalized 폴더 경로
            subject_ids: 사용할 피험자 리스트 (예: ['p00', 'p01']). None이면 전체
            eye: 'left', 'right', 'both' 중 선택
            transform: 이미지 전처리 함수
        """
        self.data_root = data_root
        self.transform = transform
        self.eye = eye
        
        # 데이터 저장할 리스트
        self.images = []
        self.gazes = []
        
        # 피험자 폴더 탐색
        if subject_ids is None:
            subject_ids = [f'p{i:02d}' for i in range(15)]  # p00 ~ p14
        
        for subject_id in subject_ids:
            subject_path = os.path.join(data_root, subject_id)
            if not os.path.exists(subject_path):
                continue
                
            # 각 day .mat 파일 로드
            for mat_file in os.listdir(subject_path):
                if not mat_file.endswith('.mat'):
                    continue
                    
                mat_path = os.path.join(subject_path, mat_file)
                self._load_mat_file(mat_path)
        
        # numpy 배열로 변환
        self.images = np.concatenate(self.images, axis=0)
        self.gazes = np.concatenate(self.gazes, axis=0)
        
        print(f"총 샘플 수: {len(self.images)}")
    
    def _load_mat_file(self, mat_path):
        """단일 .mat 파일에서 데이터 추출"""
        mat_data = sio.loadmat(mat_path)
        data = mat_data['data']
        
        eyes_to_load = []
        if self.eye in ['right', 'both']:
            eyes_to_load.append('right')
        if self.eye in ['left', 'both']:
            eyes_to_load.append('left')
        
        for eye_side in eyes_to_load:
            eye_data = data[eye_side][0, 0]
            images = eye_data['image'][0, 0]  # (N, 36, 60)
            gazes = eye_data['gaze'][0, 0]    # (N, 3)
            
            self.images.append(images)
            self.gazes.append(gazes)
    
    def __len__(self):
        return len(self.images)
    
    def __getitem__(self, idx):
        image = self.images[idx].astype(np.float32)
        gaze = self.gazes[idx].astype(np.float32)
        
        # 정규화: 0~255 → 0~1
        image = image / 255.0
        
        # 채널 차원 추가: (36, 60) → (1, 36, 60)
        image = np.expand_dims(image, axis=0)
        
        if self.transform:
            image = self.transform(image)
        
        return torch.from_numpy(image), torch.from_numpy(gaze)


# 테스트 코드
if __name__ == "__main__":
    data_root = r"C:\Users\sean0\OneDrive\바탕 화면\정보통신탐구\data\MPIIGaze\Data\Normalized"
    
    # 데이터셋 생성 (일단 p00만 테스트)
    dataset = MPIIGazeDataset(data_root, subject_ids=['p00'], eye='both')
    
    # 데이터로더 생성
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
    
    # 배치 하나 확인
    images, gazes = next(iter(dataloader))
    print(f"Image batch shape: {images.shape}")  # (32, 1, 36, 60)
    print(f"Gaze batch shape: {gazes.shape}")    # (32, 3)

