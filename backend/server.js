// ================================
// 멀티유저 시선 추적 캔버스 서버 (간소화 버전)
// ================================

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = 3000;

// frontend 폴더를 정적 파일로 제공
app.use(express.static(path.join(__dirname, '../frontend')));

// 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/art_multiplayer.html'));
});

// 캔버스 히스토리 (최근 1000개 저장)
const canvasHistory = [];
const MAX_HISTORY = 1000;

io.on('connection', (socket) => {
  console.log(`✅ 사용자 접속 (총 ${io.engine.clientsCount}명)`);

  // 기존 캔버스 내용 전송
  socket.emit('welcome', canvasHistory);

  // 브러시 스트로크 수신 및 브로드캐스트
  socket.on('brush-stroke', (data) => {
    // 히스토리에 저장
    canvasHistory.push(data);
    if (canvasHistory.length > MAX_HISTORY) {
      canvasHistory.shift();
    }
    // 다른 사용자들에게 전송
    socket.broadcast.emit('brush-stroke', data);
  });

  // 캔버스 리셋
  socket.on('reset-canvas', () => {
    canvasHistory.length = 0;
    io.emit('canvas-reset');
    console.log('🔄 캔버스 리셋');
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`❌ 사용자 퇴장 (총 ${io.engine.clientsCount}명)`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 서버 시작: http://localhost:${PORT}`);
});