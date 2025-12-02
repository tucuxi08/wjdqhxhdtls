// ================================
// 멀티유저 시선 추적 캔버스 (클라이언트)
// ================================

// Socket.IO 연결
const socket = io();

// 사용자 정보
let myUserId = null;
let myUserColor = null;
let myNickname = null;

// 다른 사용자들의 시선 포인터 저장
const otherGazePointers = new Map();

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
const SMOOTHING_FRAMES = 3;
let gazeHistory = [];
let lastGazeX = null;
let lastGazeY = null;

// 움직임 임계값 (픽셀)
const MOVEMENT_THRESHOLD = 8;

// 초기 설정
function fillMask() {
  // 배경 캔버스: 파란색
  bgCtx.fillStyle = "#0066FF";
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
  
  // 메인 캔버스: 보라색 마스크
  ctx.fillStyle = "rgba(204, 42, 190, 1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
fillMask();

console.log("✅ 초기 마스크 생성 완료 (멀티유저 버전)");

// ================================
// 2) 시선 추적 점 표시 (내 시선)
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
// 3) 다른 사용자의 시선 포인터 생성
// ================================
function createOtherGazePointer(userId, color, nickname) {
  const pointer = document.createElement('div');
  pointer.className = 'other-gaze-pointer';
  pointer.style.cssText = `
    position: fixed;
    width: 15px;
    height: 15px;
    background: ${color};
    border: 2px solid white;
    border-radius: 50%;
    pointer-events: none;
    z-index: 9998;
    transform: translate(-50%, -50%);
    display: none;
    box-shadow: 0 0 8px ${color};
    transition: all 0.05s ease-out;
  `;
  
  const label = document.createElement('div');
  label.style.cssText = `
    position: absolute;
    top: -25px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
  `;
  label.textContent = nickname;
  pointer.appendChild(label);
  
  document.body.appendChild(pointer);
  otherGazePointers.set(userId, pointer);
  
  return pointer;
}

function updateOtherGazePointer(userId, x, y) {
  let pointer = otherGazePointers.get(userId);
  if (pointer) {
    pointer.style.left = `${x}px`;
    pointer.style.top = `${y}px`;
    pointer.style.display = 'block';
    
    // 3초 후 자동 숨김
    clearTimeout(pointer.hideTimeout);
    pointer.hideTimeout = setTimeout(() => {
      pointer.style.display = 'none';
    }, 3000);
  }
}

function removeOtherGazePointer(userId) {
  const pointer = otherGazePointers.get(userId);
  if (pointer) {
    pointer.remove();
    otherGazePointers.delete(userId);
  }
}

// ================================
// 4) 상태 표시 업데이트
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
// 5) 사용자 목록 UI
// ================================
const userListDiv = document.createElement('div');
userListDiv.id = 'userList';
userListDiv.style.cssText = `
  position: fixed;
  top: 60px;
  left: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 12px;
  z-index: 10;
  max-width: 200px;
`;
document.body.appendChild(userListDiv);

function updateUserList(users) {
  let html = `<div style="font-weight: bold; margin-bottom: 5px;">접속자 (${users.length}명)</div>`;
  users.forEach(user => {
    const isSelf = user.id === myUserId;
    html += `
      <div style="margin: 3px 0; display: flex; align-items: center;">
        <div style="width: 10px; height: 10px; background: ${user.color}; border-radius: 50%; margin-right: 5px;"></div>
        <span style="${isSelf ? 'font-weight: bold;' : ''}">${user.nickname}${isSelf ? ' (나)' : ''}</span>
      </div>
    `;
  });
  userListDiv.innerHTML = html;
}

// ================================
// 6) 카메라 미리보기 연결
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
// 7) WebGazer 초기화
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
// 8) 좌표 스무딩 함수
// ================================
function smoothGaze(x, y) {
  gazeHistory.push({ x, y });
  
  if (gazeHistory.length > SMOOTHING_FRAMES) {
    gazeHistory.shift();
  }
  
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
// 9) 두 점 사이를 보간하여 브러시 적용
// ================================
function drawLine(x1, y1, x2, y2, sendToServer = true) {
  const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.ceil(distance / (brushSize * 0.3));
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    eraseAt(x, y);
  }
  
  // 서버로 브러시 스트로크 전송
  if (sendToServer && socket.connected) {
    socket.emit('brush-stroke', {
      x1, y1, x2, y2
    });
  }
}

// ================================
// 10) 브러시: 마스크를 지우면서 배경 드러내기
// ================================
function eraseAt(x, y) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, brushSize);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${brushOpacity})`);
  gradient.addColorStop(0.5, `rgba(0, 0, 0, ${brushOpacity * 0.6})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, brushSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(bgCanvas, 0, 0);
  ctx.restore();
}

// ================================
// 11) WebGazer 시선 → 부드러운 브러시 적용
// ================================
function followGaze() {
  if (!isGazerReady || !isTracking) return;
  
  webgazer.getCurrentPrediction().then((prediction) => {
    if (!prediction) return;

    updateGazePointer(prediction.x, prediction.y);
    
    const rect = canvas.getBoundingClientRect();
    let cx = prediction.x - rect.left;
    let cy = prediction.y - rect.top;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    cx = cx * scaleX;
    cy = cy * scaleY;
    
    if (cx < 0 || cy < 0 || cx > canvas.width || cy > canvas.height) return;
    
    const smoothed = smoothGaze(cx, cy);
    cx = smoothed.x;
    cy = smoothed.y;
    
    // 다른 사용자들에게 내 시선 위치 전송 (100ms마다)
    if (socket.connected && Math.random() < 0.3) {
      socket.emit('gaze-position', {
        x: prediction.x,
        y: prediction.y
      });
    }
    
    if (lastGazeX !== null && lastGazeY !== null) {
      const distance = Math.sqrt(
        (cx - lastGazeX) ** 2 + (cy - lastGazeY) ** 2
      );
      
      if (distance >= MOVEMENT_THRESHOLD) {
        drawLine(lastGazeX, lastGazeY, cx, cy, true);
        lastGazeX = cx;
        lastGazeY = cy;
      }
    } else {
      lastGazeX = cx;
      lastGazeY = cy;
      eraseAt(cx, cy);
    }
  });
}

setInterval(followGaze, 30);

// ================================
// 12) Reset 버튼
// ================================
document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm('모든 사용자의 캔버스를 리셋하시겠습니까?')) {
    socket.emit('reset-canvas');
    fillMask();
    gazeHistory = [];
    lastGazeX = null;
    lastGazeY = null;
    updateStatus('캔버스 리셋 완료', '#0f0');
  }
});

// ================================
// 13) 9점 캘리브레이션
// ================================
const calibrationOverlay = document.getElementById("calibrationOverlay");

const calibrationPoints = [
  [0.15, 0.15], [0.5, 0.15], [0.85, 0.15],
  [0.15, 0.5],  [0.5, 0.5],  [0.85, 0.5],
  [0.15, 0.75], [0.5, 0.75], [0.85, 0.75],
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

  const rect = canvas.getBoundingClientRect();
  updateStatus('캘리브레이션 진행 중... (9점)', 'yellow');

  for (let i = 0; i < calibrationPoints.length; i++) {
    const [nx, ny] = calibrationPoints[i];
    const x = nx * rect.width;
    const y = ny * rect.height;

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
// 14) 마우스 테스트
// ================================
let isMouseDown = false;
let lastMouseX = null;
let lastMouseY = null;

canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const scaledX = x * scaleX;
  const scaledY = y * scaleY;
  lastMouseX = scaledX;
  lastMouseY = scaledY;
  eraseAt(scaledX, scaledY);
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    
    if (lastMouseX !== null && lastMouseY !== null) {
      drawLine(lastMouseX, lastMouseY, scaledX, scaledY, true);
    }
    
    lastMouseX = scaledX;
    lastMouseY = scaledY;
  }
});

// ================================
// 15) Socket.IO 이벤트 핸들러
// ================================

// 서버 연결 완료
socket.on('welcome', (data) => {
  myUserId = data.userId;
  myUserColor = data.userColor;
  myNickname = data.nickname;
  
  console.log(`🎉 서버 연결 완료! 나의 ID: ${myUserId}`);
  updateStatus(`서버 연결됨 (${myNickname})`, '#0f0');
  
  // 기존 캔버스 내용 복원
  if (data.canvasHistory && data.canvasHistory.length > 0) {
    console.log(`📜 ${data.canvasHistory.length}개의 브러시 스트로크 복원 중...`);
    data.canvasHistory.forEach(stroke => {
      drawLine(stroke.x1, stroke.y1, stroke.x2, stroke.y2, false);
    });
  }
});

// 다른 사용자 접속
socket.on('user-joined', (data) => {
  console.log(`👋 ${data.nickname} 님이 접속했습니다.`);
  createOtherGazePointer(data.userId, data.color, data.nickname);
});

// 사용자 목록 업데이트
socket.on('user-list', (users) => {
  updateUserList(users);
});

// 다른 사용자의 브러시 스트로크 수신
socket.on('brush-stroke', (data) => {
  drawLine(data.x1, data.y1, data.x2, data.y2, false);
});

// 다른 사용자의 시선 위치 수신
socket.on('gaze-position', (data) => {
  if (!otherGazePointers.has(data.userId)) {
    createOtherGazePointer(data.userId, data.color, data.nickname);
  }
  updateOtherGazePointer(data.userId, data.x, data.y);
});

// 사용자 연결 해제
socket.on('user-left', (data) => {
  console.log(`👋 ${data.nickname} 님이 나갔습니다.`);
  removeOtherGazePointer(data.userId);
});

// 캔버스 리셋
socket.on('canvas-reset', () => {
  fillMask();
  gazeHistory = [];
  lastGazeX = null;
  lastGazeY = null;
  console.log('🔄 캔버스가 리셋되었습니다.');
});

// 연결 끊김
socket.on('disconnect', () => {
  updateStatus('서버 연결 끊김', 'red');
  console.log('❌ 서버 연결이 끊어졌습니다.');
});

// 재연결
socket.on('reconnect', () => {
  updateStatus('서버 재연결됨', '#0f0');
  console.log('✅ 서버에 재연결되었습니다.');
});

// ================================
// 16) 초기화 실행
// ================================
async function init() {
  console.log("🚀 멀티유저 시선 추적 캔버스 초기화");
  updateStatus('초기화 중...', 'yellow');
  
  await setupCamera();
  await initWebGazer();
  
  updateStatus('준비 완료! Calibrate 클릭', '#0f0');
  console.log("✅ 모든 초기화 완료");
  console.log(`🎨 브러시 설정: 크기=${brushSize}, 임계값=${MOVEMENT_THRESHOLD}px`);
}

window.addEventListener('load', init);

console.log("💡 멀티유저 협업 모드 활성화!");
console.log("👁️ 다른 사용자의 시선도 실시간으로 확인 가능!");