이터 로드 =====
    print("데이터 로딩 중...")
    dataset = MPIIGazeDataset(DATA_ROOT, subject_ids=None, eye='both')
    
    # Train/Val 분할 (80/20)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
 