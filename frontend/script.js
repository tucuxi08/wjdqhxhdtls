// ================================
// 1) Canvas 설정 (2개 레이어)
// ================================
const canvas = document.getElementById("artCanvas");
const ctx = canvas.getContext("2d");

// 오프스크린 캔버스 생성 (배경용)
const bgCanvas = document.createElement('canvas');
bgCanvas.width = canvas.width;
bgCanvas.height = canvas.height;
const bgCtx = bgCanvas.getContext('2d');

// 브러시 설정
const brushSize = 20;
const brushOpacity = 1.0;

// 상태 관리
let isGazerReady = false;
let isTracking = false;

// 스무딩을 위한 좌표 버퍼
const SMOOTHING_FRAMES = 5; // 최근 5개 프레임 평균
let gazeHistory = [];
let lastGazeX = null;
let lastGazeY = null;

// 움직임 임계값 (픽셀)
const MOVEMENT_THRESHOLD = 15; // 15픽셀 이상 움직여야 브러시 적용

// 초기 설정
function fillMask() {
  // 배경 캔버스: 파란색
  bgCtx.fillStyle = "#0066FF";
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
  
  // 메인 캔버스: 빨간색 마스크
  ctx.fillStyle = "rgba(204, 42, 190, 1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
fillMask();

console.log("✅ 초기 마스크 생성 완료 (부드러운 브러시 버전)");

// ================================
// 2) 시선 추적 점 표시
// ================================
const gazePointer = document.createElement('div');
gazePointer.id = 'gazePointer';
gazePointer.style.cssText = `
  position: fixed;
  width: 20px;
  height: 20px;
  background: lime;
  border: 2px solid white;
  border-radius: 50%;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  display: none;
  box-shadow: 0 0 10px rgba(0,255,0,0.8);
  transition: all 0.1s ease-out;
`;
document.body.appendChild(gazePointer);

function updateGazePointer(x, y) {
  gazePointer.style.left = `${x}px`;
  gazePointer.style.top = `${y}px`;
  gazePointer.style.display = 'block';
}

// ================================
// 3) 상태 표시 업데이트
// ================================
const statusDisplay = document.getElementById('statusDisplay');

function updateStatus(message, color = '#0f0') {
  if (statusDisplay) {
    statusDisplay.textContent = message;
    statusDisplay.style.color = color;
  }
  console.log(message);
}

updateStatus('초기화 중...', 'yellow');

// ================================
// 4) 카메라 미리보기 연결
// ================================
let cameraStream = null;

async function setupCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 640, height: 480 } 
    });
    document.getElementById("cameraPreview").srcObject = cameraStream;
    updateStatus('카메라 연결 완료', '#0f0');
  } catch (err) {
    console.error("❌ 카메라 에러:", err);
    updateStatus('카메라 접근 실패', 'red');
  }
}

// ================================
// 5) WebGazer 초기화
// ================================
async function initWebGazer() {
  try {
    updateStatus('WebGazer 초기화 중...', 'yellow');
    
    webgazer.params.collectMouseData = false;
    
    await webgazer
      .setTracker("TFFacemesh")
      .setRegression("ridge")
      .begin();
    
    webgazer
      .showVideoPreview(false)
      .showFaceOverlay(false)
      .showPredictionPoints(false)
      .showFaceFeedbackBox(false);
    
    setTimeout(() => {
      const webgazerVideoElements = document.querySelectorAll(
        '#webgazerVideoFeed, #webgazerVideoCanvas, #webgazerFaceOverlay, #webgazerFaceFeedbackBox'
      );
      webgazerVideoElements.forEach(el => {
        if (el) el.style.display = 'none';
      });
    }, 100);
    
    isGazerReady = true;
    updateStatus('WebGazer 준비 완료! Calibrate 버튼 클릭', '#0f0');
    
  } catch (err) {
    console.error("❌ WebGazer 초기화 실패:", err);
    updateStatus('WebGazer 초기화 실패', 'red');
  }
}

// ================================
// 6) 좌표 스무딩 함수
// ================================
function smoothGaze(x, y) {
  // 히스토리에 추가
  gazeHistory.push({ x, y });
  
  // 최근 N개만 유지
  if (gazeHistory.length > SMOOTHING_FRAMES) {
    gazeHistory.shift();
  }
  
  // 평균 계산
  let sumX = 0, sumY = 0;
  gazeHistory.forEach(pos => {
    sumX += pos.x;
    sumY += pos.y;
  });
  
  return {
    x: sumX / gazeHistory.length,
    y: sumY / gazeHistory.length
  };
}

// ================================
// 7) 두 점 사이를 보간하여 브러시 적용
// ================================
function drawLine(x1, y1, x2, y2) {
  const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.ceil(distance / (brushSize * 0.3)); // 브러시 크기의 30%씩 이동
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    eraseAt(x, y);
  }
}

// ================================
// 8) 브러시: 마스크를 지우면서 배경 드러내기
// ================================
function eraseAt(x, y) {
  // 메인 캔버스의 해당 부분을 지움
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  
  // Radial Gradient로 부드러운 브러시
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, brushSize);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${brushOpacity})`);
  gradient.addColorStop(0.5, `rgba(0, 0, 0, ${brushOpacity * 0.6})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, brushSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  // 배경을 그 위에 그림
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(bgCanvas, 0, 0);
  ctx.restore();
}

// ================================
// 9) WebGazer 시선 → 부드러운 브러시 적용
// ================================
function followGaze() {
  if (!isGazerReady || !isTracking) return;
  
  webgazer.getCurrentPrediction().then((prediction) => {
    if (!prediction) return;

    // 화면 좌표 업데이트 (초록 점 - 원본)
    updateGazePointer(prediction.x, prediction.y);
    
    // 캔버스 좌표로 변환
    const rect = canvas.getBoundingClientRect();
    let cx = prediction.x - rect.left;
    let cy = prediction.y - rect.top;
    
    // 캔버스 범위 체크
    if (cx < 0 || cy < 0 || cx > canvas.width || cy > canvas.height) return;
    
    // 스무딩 적용
    const smoothed = smoothGaze(cx, cy);
    cx = smoothed.x;
    cy = smoothed.y;
    
    // 이전 위치가 있으면
    if (lastGazeX !== null && lastGazeY !== null) {
      // 움직임 거리 계산
      const distance = Math.sqrt(
        (cx - lastGazeX) ** 2 + (cy - lastGazeY) ** 2
      );
      
      // 임계값 이상 움직였을 때만 브러시 적용
      if (distance >= MOVEMENT_THRESHOLD) {
        console.log(`🖌️ 브러시 적용: (${Math.round(cx)}, ${Math.round(cy)}) 거리: ${Math.round(distance)}px`);
        
        // 이전 위치와 현재 위치 사이를 보간하여 그리기
        drawLine(lastGazeX, lastGazeY, cx, cy);
        
        // 현재 위치 저장
        lastGazeX = cx;
        lastGazeY = cy;
      }
    } else {
      // 첫 번째 위치
      lastGazeX = cx;
      lastGazeY = cy;
      eraseAt(cx, cy);
    }
  });
}

// 더 느린 업데이트 (100ms = 초당 10회)
setInterval(followGaze, 100);

// ================================
// 10) Reset 버튼
// ================================
document.getElementById("resetBtn").addEventListener("click", () => {
  fillMask();
  gazeHistory = [];
  lastGazeX = null;
  lastGazeY = null;
  updateStatus('캔버스 리셋 완료', '#0f0');
  console.log("🔄 리셋");
});

// ================================
// 11) 9점 캘리브레이션
// ================================
const calibrationOverlay = document.getElementById("calibrationOverlay");

const calibrationPoints = [
  [0.15, 0.15], [0.5, 0.15], [0.85, 0.15],
  [0.15, 0.5],  [0.5, 0.5],  [0.85, 0.5],
  [0.15, 0.85], [0.5, 0.85], [0.85, 0.85],
];

function createCalibPoint(x, y) {
  const dot = document.createElement("div");
  dot.classList.add("calib-point");
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;
  calibrationOverlay.appendChild(dot);
  return dot;
}

async function runCalibration() {
  if (!isGazerReady) {
    alert("WebGazer가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.");
    return;
  }
  
  isTracking = false;
  gazePointer.style.display = 'none';
  gazeHistory = [];
  lastGazeX = null;
  lastGazeY = null;
  
  calibrationOverlay.innerHTML = "";
  calibrationOverlay.style.pointerEvents = "auto";

  const w = canvas.width;
  const h = canvas.height;
  const rect = canvas.getBoundingClientRect();

  updateStatus('캘리브레이션 진행 중... (9점)', 'yellow');

  for (let i = 0; i < calibrationPoints.length; i++) {
    const [nx, ny] = calibrationPoints[i];
    const x = nx * w;
    const y = ny * h;

    const dot = createCalibPoint(x, y);
    dot.style.opacity = 1;
    
    updateStatus(`캘리브레이션 ${i + 1}/9`, 'yellow');

    await new Promise((resolve) => {
      setTimeout(() => {
        const screenX = rect.left + x;
        const screenY = rect.top + y;
        
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: screenX,
          clientY: screenY
        });
        
        canvas.dispatchEvent(clickEvent);
        webgazer.recordScreenPosition(screenX, screenY, 'click');
        
        resolve();
      }, 1500);
    });

    dot.style.opacity = 0;
    await new Promise((res) => setTimeout(res, 300));
  }

  calibrationOverlay.innerHTML = "";
  calibrationOverlay.style.pointerEvents = "none";
  
  isTracking = true;
  gazePointer.style.display = 'block';
  
  updateStatus('캘리브레이션 완료! 시선 추적 중', '#0f0');
  console.log("✅ 캘리브레이션 완료!");
}

document.getElementById("calibrateBtn").addEventListener("click", runCalibration);

// ================================
// 12) 초기화 실행
// ================================
async function init() {
  console.log("🚀 초기화 시작");
  updateStatus('초기화 중...', 'yellow');
  
  await setupCamera();
  await initWebGazer();
  
  updateStatus('준비 완료! Calibrate 클릭', '#0f0');
  console.log("✅ 모든 초기화 완료");
  console.log("🎨 부드러운 브러시 설정:");
  console.log(`   - 스무딩 프레임: ${SMOOTHING_FRAMES}`);
  console.log(`   - 움직임 임계값: ${MOVEMENT_THRESHOLD}px`);
  console.log(`   - 업데이트 주기: 100ms (초당 10회)`);
}

window.addEventListener('load', init);

// ================================
// 13) 마우스 테스트 (부드러운 버전)
// ================================
let isMouseDown = false;
let lastMouseX = null;
let lastMouseY = null;

canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  lastMouseX = x;
  lastMouseY = y;
  console.log(`🖱️ 마우스 클릭: (${Math.round(x)}, ${Math.round(y)})`);
  eraseAt(x, y);
});

canvas.addEventListener('mouseup', () => {
  isMouseDown = false;
  lastMouseX = null;
  lastMouseY = null;
});

canvas.addEventListener('mousemove', (e) => {
  if (isMouseDown) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 마우스도 보간 적용
    if (lastMouseX !== null && lastMouseY !== null) {
      drawLine(lastMouseX, lastMouseY, x, y);
    }
    
    lastMouseX = x;
    lastMouseY = y;
  }
});

console.log("💡 Tip: 마우스를 클릭&드래그하면 부드러운 브러시 테스트");
console.log("👁️ Tip: 초록색 점은 원본 시선, 브러시는 스무딩된 위치");
console.log("🎯 개선사항: 스무딩 + 임계값 + 보간 = 부드러운 브러시!");