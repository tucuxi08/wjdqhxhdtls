# model.py
import torch
import torch.nn as nn
import torch.nn.functional as F

class GazeNet(nn.Module):
    """
    간단한 CNN 기반 시선 추정 모델
    입력: (B, 1, 36, 60) 눈 이미지
    출력: (B, 3) 시선 방향 벡터
    """
    
    def __init__(self):
        super(GazeNet, self).__init__()
        
        # CNN 레이어들
        self.conv1 = nn.Conv2d(1, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        
        self.pool = nn.MaxPool2d(2, 2)
        self.dropout = nn.Dropout(0.5)
        
        # Fully Connected 레이어
        # 36x60 → 18x30 → 9x15 → 4x7 (3번 pooling 후)
        self.fc1 = nn.Linear(128 * 4 * 7, 256)
        self.fc2 = nn.Linear(256, 3)  # 출력: 3D gaze vector
        
    def forward(self, x):
        # Conv Block 1
        x = self.pool(F.relu(self.conv1(x)))  # (B, 32, 18, 30)
        
        # Conv Block 2
        x = self.pool(F.relu(self.conv2(x)))  # (B, 64, 9, 15)
        
        # Conv Block 3
        x = self.pool(F.relu(self.conv3(x)))  # (B, 128, 4, 7)
        
        # Flatten
        x = x.view(x.size(0), -1)  # (B, 128*4*7)
        
        # FC layers
        x = self.dropout(F.relu(self.fc1(x)))
        x = self.fc2(x)
        
        return x


# 모델 테스트
if __name__ == "__main__":
    model = GazeNet()
    
    # 더미 입력
    dummy_input = torch.randn(32, 1, 36, 60)
    output = model(dummy_input)
    
    print(f"Input shape: {dummy_input.shape}")
    print(f"Output shape: {output.shape}")
    print(f"\n모델 파라미터 수: {sum(p.numel() for p in model.parameters()):,}")