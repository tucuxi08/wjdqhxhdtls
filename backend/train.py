import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
import numpy as np
import matplotlib.pyplot as plt
from dataset import MPIIGazeDataset
from model import GazeNet

def angular_error(pred, target):
    """
    Angular Error 계산 (도 단위)
    두 3D 벡터 사이의 각도를 계산
    """
    # 벡터 정규화
    pred_norm = pred / (torch.norm(pred, dim=1, keepdim=True) + 1e-7)
    target_norm = target / (torch.norm(target, dim=1, keepdim=True) + 1e-7)
    
    # 내적 → 각도
    cos_sim = torch.sum(pred_norm * target_norm, dim=1)
    cos_sim = torch.clamp(cos_sim, -1, 1)  # acos 안정성
    angle_rad = torch.acos(cos_sim)
    angle_deg = angle_rad * 180 / np.pi
    
    return angle_deg.mean()

def train():
    # ===== 설정 =====
    DATA_ROOT = r"C:\Users\sean0\OneDrive\바탕 화면\정보통신탐구\data\MPIIGaze\Data\Normalized"
    BATCH_SIZE = 64
    EPOCHS = 20
    LEARNING_RATE = 0.001
    DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    print(f"Using device: {DEVICE}")
    
    # ===== 데이터 로드 =====
    print("데이터 로딩 중...")
    dataset = MPIIGazeDataset(DATA_ROOT, subject_ids=None, eye='both')
    
    # Train/Val 분할 (80/20)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_dataset, val_dataset = random_split(dataset, [train_size, val_size])
    
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)
    
    print(f"Train: {len(train_dataset)}, Val: {len(val_dataset)}")
    
    # ===== 모델, Loss, Optimizer =====
    model = GazeNet().to(DEVICE)
    criterion = nn.MSELoss()  # 기본 Loss
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=3, factor=0.5)
    
    # ===== 학습 기록 =====
    history = {
        'train_loss': [],
        'val_loss': [],
        'train_angle': [],
        'val_angle': []
    }
    
    best_val_angle = float('inf')
    
    # ===== 학습 루프 =====
    for epoch in range(EPOCHS):
        # --- Train ---
        model.train()
        train_losses = []
        train_angles = []
        
        for images, gazes in train_loader:
            images, gazes = images.to(DEVICE), gazes.to(DEVICE)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, gazes)
            loss.backward()
            optimizer.step()
            
            train_losses.append(loss.item())
            train_angles.append(angular_error(outputs, gazes).item())
        
        # --- Validation ---
        model.eval()
        val_losses = []
        val_angles = []
        
        with torch.no_grad():
            for images, gazes in val_loader:
                images, gazes = images.to(DEVICE), gazes.to(DEVICE)
                outputs = model(images)
                loss = criterion(outputs, gazes)
                
                val_losses.append(loss.item())
                val_angles.append(angular_error(outputs, gazes).item())
        
        # --- 기록 ---
        train_loss = np.mean(train_losses)
        val_loss = np.mean(val_losses)
        train_angle = np.mean(train_angles)
        val_angle = np.mean(val_angles)
        
        history['train_loss'].append(train_loss)
        history['val_loss'].append(val_loss)
        history['train_angle'].append(train_angle)
        history['val_angle'].append(val_angle)
        
        scheduler.step(val_loss)
        
        print(f"Epoch {epoch+1}/{EPOCHS} | "
              f"Train Loss: {train_loss:.4f}, Angle: {train_angle:.2f}° | "
              f"Val Loss: {val_loss:.4f}, Angle: {val_angle:.2f}°")
        
        # Best 모델 저장
        if val_angle < best_val_angle:
            best_val_angle = val_angle
            torch.save(model.state_dict(), 'best_model.pth')
            print(f"  → Best model saved! ({val_angle:.2f}°)")
    
    # ===== 학습 곡선 시각화 =====
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    
    axes[0].plot(history['train_loss'], label='Train')
    axes[0].plot(history['val_loss'], label='Val')
    axes[0].set_title('Loss')
    axes[0].legend()
    
    axes[1].plot(history['train_angle'], label='Train')
    axes[1].plot(history['val_angle'], label='Val')
    axes[1].set_title('Angular Error (°)')
    axes[1].legend()
    
    plt.tight_layout()
    plt.savefig('training_curve.png')
    plt.show()
    
    print(f"\n최종 Best Angular Error: {best_val_angle:.2f}°")

if __name__ == "__main__":
    train()