import scipy.io as sio
import numpy as np

mat_path = r"C:\Users\sean0\OneDrive\바탕 화면\정보통신탐구\data\MPIIGaze\Data\Normalized\p00\day01.mat"
mat_data = sio.loadmat(mat_path)

data = mat_data['data']
right_data = data['right'][0, 0]

# 각 필드의 실제 데이터 확인
gaze = right_data['gaze'][0, 0]
image = right_data['image'][0, 0]
pose = right_data['pose'][0, 0]

print(f"=== 실제 데이터 Shape ===")
print(f"gaze shape: {gaze.shape}")   # 예상: (995, 2) - pitch, yaw
print(f"image shape: {image.shape}") # 예상: (995, 36, 60) 또는 (36, 60, 995)
print(f"pose shape: {pose.shape}")

print(f"\n=== 샘플 값 확인 ===")
print(f"gaze[0]: {gaze[0]}")  # 첫 번째 샘플의 시선 방향
print(f"image min/max: {image.min()}, {image.max()}")  # 픽셀값 범위