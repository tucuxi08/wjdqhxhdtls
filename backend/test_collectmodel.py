# check_model.py
import torch
from model import GazeNet

model = GazeNet()
model.load_state_dict(torch.load('best_model.pth'))
print("모델 로드 성공!")
print(f"파라미터 수: {sum(p.numel() for p in model.parameters()):,}")