// 1. Canvas 설정
const canvas = document.getElementById("artCanvas");
const ctx = canvas.getContext("2d");

// 2. 브러시 설정 (Soft Circle, Feather 45%, Opacity 1.0, 크기 100px)
const brushSize = 100;
const brushOpacity = 1.0;
const brushFeather = 45;  // 부드러운 경계 효과

// 3. WebGazer 설정 (시선 좌표 추적)
webgazer.setRegression('ridge') // 회귀 모형 설정
  .setTracker('clmtrackr') // 트래킹 방식 설정
  .begin();

// 4. 마우스 이벤트로 브러시 미리보기 (테스트용)
canvas.addEventListener('mousemove', (e) => {
  drawBrush(e.offsetX, e.offsetY);
});

// 5. WebGazer의 시선 좌표로 브러시 그리기
function drawGaze() {
  webgazer.getCurrentPrediction().then(function(prediction) {
    if (prediction) {
      // 예측된 시선 좌표를 얻어 브러시로 그리기
      const x = prediction.x;
      const y = prediction.y;
      drawBrush(x, y);
    }
  });
}

// 6. 브러시를 그리는 함수 (원형 지우개)
function drawBrush(x, y) {
  ctx.globalCompositeOperation = 'destination-out'; // 지우개 효과
  ctx.beginPath();
  ctx.arc(x, y, brushSize, 0, Math.PI * 2);  // 원형 브러시
  ctx.fillStyle = `rgba(0, 0, 0, ${brushOpacity})`;  // 투명도 설정
  ctx.filter = `blur(${brushFeather}px)`;  // 부드러운 경계 효과
  ctx.fill();
  ctx.filter = 'none';  // 필터 리셋
}

// 7. 캘리브레이션 함수 (필요시 사용자에 따라)
function calibrate() {
  // 카메라로 사용자 얼굴을 추적하면서, 화면을 가리킬 수 있도록 유도
  alert("Please calibrate by staring at the center of the screen for 3 seconds!");
}

// 8. 리셋 버튼 함수
document.getElementById('resetBtn').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // 캔버스 클리어
});

// 9. WebGazer 시작: 시선 추적을 위한 라이브러리 초기화
function startWebGazer() {
  if (!webgazer.isReady()) {
    alert("WebGazer is not ready!");
  }
  setInterval(drawGaze, 50); // 50ms마다 시선 좌표를 확인
}

// 시작 시 WebGazer와 캔버스 연결
startWebGazer();
