from pathlib import Path
from scipy.io import loadmat

BASE_DIR = Path(__file__).resolve().parent
P00_DIR = BASE_DIR / "data" / "MPIIGaze" / "Data" / "Normalized" / "p00"

first_mat = sorted(P00_DIR.glob("day*.mat"))[0]
print("열 파일:", first_mat)

mat = loadmat(str(first_mat))
print(mat.keys())  # 최상위 키들 확인