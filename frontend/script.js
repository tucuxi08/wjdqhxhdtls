// ================================
// 1) Canvas & 기본 마스크 설정
// ================================
const canvas = document.getElementById("artCanvas");
const ctx = canvas.getContext("2d");

// 브러시 설정
const brushSize = 100;
const brushOpacity = 1.0;

// 상태 관리
let isGazerReady = false;
let isTracking = false;
let currentGazeX = null;
let currentGazeY = null;

// 초기 마스크: 전체를 검은색으로 채워서 "덮힌 상태"로 시작
function fillMask() {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
fillMask();

console.log("✅ 초기 마스크 생성 완료");

// ================================
// 2) 시선 추적 점 표시 (NEW!)
// ================================
const gazePointer = document.createElement('div');
gazePointer.id = 'gazePointer';
gazePointer.style.cssText = `
  position: fixed;
  width: 20px;
  height: 20px;
  background: red;
  border: 2px solid white;
  border-radius: 50%;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  display: none;
  box-shadow: 0 0 10px rgba(255,0,0,0.5);
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
    
    // 마우스 데이터를 학습에 사용하지 않도록
    webgazer.params.collectMouseData = false;
    
    // WebGazer 시작 (await로 완료 대기)
    await webgazer
      .setTracker("TFFacemesh")
      .setRegression("ridge")
      .begin();
    
    // WebGazer UI 완전히 숨기기
    webgazer
      .showVideoPreview(false)
      .showFaceOverlay(false)
      .showPredictionPoints(false)
      .showFaceFeedbackBox(false);
    
    // WebGazer의 내부 비디오 요소 숨기기
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
// 6) 브러시: 시선 위치를 기준으로 마스크를 "지우기"
// ================================
function eraseAt(x, y) {
  console.log(`🖌️ 브러시 적용: (${Math.round(x)}, ${Math.round(y)})`);
  
  // Radial Gradient로 부드러운 브러시
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, brushSize);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${brushOpacity})`);
  gradient.addColorStop(0.5, `rgba(0, 0, 0, ${brushOpacity * 0.6})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, brushSize, 0, Math.PI * 2);
  ctx.fill();
}

// ================================
// 7) WebGazer 시선 → 캔버스 좌표 변환 후 브러시 적용
// ================================
function followGaze() {
  if (!isGazerReady || !isTracking) return;
  
  webgazer.getCurrentPrediction().then((prediction) => {
    if (!prediction) return;

    // 화면 좌표 업데이트 (빨간 점 표시)
    updateGazePointer(prediction.x, prediction.y);
    
    // prediction.x, y는 "화면(viewport)" 기준 좌표
    const rect = canvas.getBoundingClientRect();
    const cx = prediction.x - rect.left;
    const cy = prediction.y - rect.top;
    
    // 현재 시선 좌표 저장
    currentGazeX = cx;
    currentGazeY = cy;

    // 캔버스 범위 체크
    if (cx < 0 || cy < 0 || cx > canvas.width || cy > canvas.height) return;

    eraseAt(cx, cy);
  });
}

// 50ms마다 시선 좌표 읽어서 브러시 적용
setInterval(followGaze, 50);

// ================================
// 8) Reset 버튼: 마스크 초기화
// ================================
document.getElementById("resetBtn").addEventListener("click", () => {
  fillMask();
  updateStatus('캔버스 리셋 완료', '#0f0');
});

// ================================
// 9) 9점 캘리브레이션
// ================================
const calibrationOverlay = document.getElementById("calibrationOverlay");

// (0~1) 비율 좌표로 9점 정의
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
  
  // 추적 일시 중지
  isTracking = false;
  gazePointer.style.display = 'none';
  
  calibrationOverlay.innerHTML = "";
  calibrationOverlay.style.pointerEvents = "auto";

  const w = canvas.width;
  const h = canvas.height;
  const rect = canvas.getBoundingClientRect();

  updateStatus('캘리브레이션 진행 중... (9점)', 'yellow');

  // 9점 순서대로 표시
  for (let i = 0; i < calibrationPoints.length; i++) {
    const [nx, ny] = calibrationPoints[i];
    const x = nx * w;
    const y = ny * h;

    const dot = createCalibPoint(x, y);
    dot.style.opacity = 1;
    
    updateStatus(`캘리브레이션 ${i + 1}/9`, 'yellow');

    // 클릭 이벤트 대기
    await new Promise((resolve) => {
      setTimeout(() => {
        // 화면 좌표로 클릭 이벤트 생성
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
        
        // WebGazer에 수동으로 캘리브레이션 포인트 기록
        webgazer.recordScreenPosition(screenX, screenY, 'click');
        
        resolve();
      }, 1500);
    });

    // 점 숨기기
    dot.style.opacity = 0;
    await new Promise((res) => setTimeout(res, 300));
  }

  calibrationOverlay.innerHTML = "";
  calibrationOverlay.style.pointerEvents = "none";
  
  // 추적 재개
  isTracking = true;
  gazePointer.style.display = 'block';
  
  updateStatus('캘리브레이션 완료! 시선 추적 중', '#0f0');
  console.log("✅ 캘리브레이션 완료!");
}

document.getElementById("calibrateBtn").addEventListener("click", runCalibration);

// ================================
// 10) 초기화 실행
// ================================
async function init() {
  console.log("🚀 초기화 시작");
  updateStatus('초기화 중...', 'yellow');
  
  await setupCamera();
  await initWebGazer();
  
  updateStatus('준비 완료! Calibrate 클릭', '#0f0');
  console.log("✅ 모든 초기화 완료");
}

// 페이지 로드 시 초기화
window.addEventListener('load', init);

// ================================
// 11) 디버깅: 마우스 테스트
// ================================
let isMouseDown = false;

canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  console.log(`🖱️ 마우스 클릭: (${Math.round(x)}, ${Math.round(y)})`);
  eraseAt(x, y);
});

canvas.addEventListener('mouseup', () => {
  isMouseDown = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (isMouseDown) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    eraseAt(x, y);
  }
});

console.log("💡 Tip: 마우스를 클릭&드래그하면 브러시 테스트 가능");
console.log("👁️ Tip: 빨간 점이 시선 위치를 표시합니다");