# 채팅방 만들기 -(2)

[채팅방 만들기 -(1)](https://www.notion.so/1-1a590b065cb980fb978fc90024a553a4?pvs=21)을 기반으로 배운 socket.io 지식으로 간단한 채팅방 페이지를 만들고 흐름에 맞게 대응하는 코드를 분석해봅시다.

### 전체코드

- index.html (프론트)
    
    ```jsx
    <!-- public/index.html -->
    <!DOCTYPE html>
    <html lang="ko">
    
    <head>
        <meta charset="UTF-8">
        <title>웹소켓 채팅방</title>
        <style>
            body {
                font-family: Arial, sans-serif;
            }
    
            #chat {
                border: 1px solid #ccc;
                height: 300px;
                overflow-y: scroll;
                padding: 10px;
            }
    
            #messageForm {
                margin-top: 10px;
            }
        </style>
    </head>
    
    <body>
        <h1>웹소켓 채팅방</h1>
        <!-- 간단한 유저 식별: 이름과 방 입력 -->
        <div id="login">
            <input id="username" type="text" placeholder="이름" />
            <input id="room" type="text" placeholder="채팅방 이름" />
            <button id="joinBtn">입장</button>
        </div>
        <div id="chatContainer" style="display: none;">
            <div id="chat"></div>
            <form id="messageForm">
                <input id="messageInput" type="text" placeholder="메시지 입력..." autocomplete="off" />
                <button type="submit">전송</button>
            </form>
        </div>
    
        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
    
            const loginDiv = document.getElementById('login');
            const chatContainer = document.getElementById('chatContainer');
            const joinBtn = document.getElementById('joinBtn');
            const usernameInput = document.getElementById('username');
            const roomInput = document.getElementById('room');
            const chatDiv = document.getElementById('chat');
            const messageForm = document.getElementById('messageForm');
            const messageInput = document.getElementById('messageInput');
    
            // 로그인 후 채팅방 입장
            joinBtn.addEventListener('click', () => {
                const username = usernameInput.value.trim();
                const room = roomInput.value.trim();
                if (!username || !room) return alert('이름과 채팅방을 입력하세요.');
    
                // 서버에 방 입장 요청
                socket.emit('joinRoom', { username, room });
    
                loginDiv.style.display = 'none';
                chatContainer.style.display = 'block';
            });
    
            // 이전 메시지 로드
            socket.on('previousMessages', (messages) => {
                messages.forEach(addMessage);
            });
    
            // 새 메시지 수신
            socket.on('message', (msg) => {
                addMessage(msg);
            });
    
            // 메시지 전송
            messageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const msg = messageInput.value.trim();
                if (msg) {
                    socket.emit('chatMessage', msg);
                    messageInput.value = '';
                }
            });
    
            // 채팅 메시지 추가 함수
            function addMessage({ username, message, createdAt }) {
                const time = new Date(createdAt).toLocaleTimeString();
                const msgElem = document.createElement('div');
                msgElem.textContent = `[${time}] ${username}: ${message}`;
                chatDiv.appendChild(msgElem);
                chatDiv.scrollTop = chatDiv.scrollHeight;
            }
        </script>
    </body>
    
    </html>
    ```
    
- app.js (백엔드)
    
    ```jsx
    // app.js
    const express = require('express');
    const http = require('http');
    const socketIo = require('socket.io');
    const mongoose = require('mongoose');
    
    const app = express();
    const server = http.createServer(app);
    const io = socketIo(server);
    
    // MongoDB 연결 (Docker로 실행한 MongoDB)
    mongoose.connect('mongodb://root:1533@127.0.0.1:27017/chat?authSource=admin', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    
    // MongoDB 스키마 및 모델 정의
    const messageSchema = new mongoose.Schema({
        username: String,
        room: String,
        message: String,
        createdAt: { type: Date, default: Date.now },
    });
    
    const Message = mongoose.model('Message', messageSchema);
    
    // 정적 파일 제공 (HTML, CSS, client-side JS)
    app.use(express.static('public'));
    
    // Socket.IO 연결
    io.on('connection', (socket) => {
        console.log('새 클라이언트 접속');
    
        // 클라이언트가 방에 입장할 때: { room: 'roomName', username: 'userName' }
        socket.on('joinRoom', async ({ room, username }) => {
            socket.join(room);
            socket.username = username;
            socket.room = room;
    
            // 해당 채팅방의 이전 메시지들을 DB에서 가져오기
            try {
                const messages = await Message.find({ room }).sort({ createdAt: 1 }).limit(50);
                socket.emit('previousMessages', messages);
            } catch (err) {
                console.error(err);
            }
    
            // 입장 메시지 브로드캐스트 (입장한 클라이언트 제외)
            socket.to(room).emit('message', {
                username: 'system',
                message: `${username}님이 입장했습니다.`,
                createdAt: new Date(),
            });
        });
    
        // 클라이언트가 메시지를 보낼 때
        socket.on('chatMessage', async (msg) => {
            const messageData = {
                username: socket.username,
                room: socket.room,
                message: msg,
                createdAt: new Date(),
            };
    
            // DB에 메시지 저장
            try {
                const message = new Message(messageData);
                await message.save();
            } catch (err) {
                console.error(err);
            }
    
            // 같은 방에 있는 모든 클라이언트에게 메시지 전송
            io.to(socket.room).emit('message', messageData);
        });
    
        // 연결 종료 시
        socket.on('disconnect', () => {
            if (socket.username && socket.room) {
                socket.to(socket.room).emit('message', {
                    username: 'system',
                    message: `${socket.username}님이 퇴장했습니다.`,
                    createdAt: new Date(),
                });
            }
        });
    });
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`Server running on localhost:${PORT}`));
    ```
    

플로우를 하나씩 뜯어봅시다. 어차피 총 4단계밖에 없음

### 1. 유저명, 채팅방명을 입력하고 입장버튼 클릭

---

```jsx
    <!-- 간단한 유저 식별: 이름과 방 입력 -->
    <div id="login">
        <input id="username" type="text" placeholder="이름" />
        <input id="room" type="text" placeholder="채팅방 이름" />
        <button id="joinBtn">입장</button>
    </div>
    
...

        // 로그인 후 채팅방 입장
        joinBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            const room = roomInput.value.trim();
            if (!username || !room) return alert('이름과 채팅방을 입력하세요.');

            // 서버에 방 입장 요청
            socket.emit('joinRoom', { username, room });

            loginDiv.style.display = 'none';
            chatContainer.style.display = 'block';
        });
```

- `emit` 메서드는 송신하는 기능이었습니다.
    - joinRoom이란 소켓 통신에 {유저명, 채팅방명}을 담아 보냅니다.
    - 그리고 채팅화면으로 전환시킵니다.

### 2. 클라이언트를 방에 입장시키고 이전 채팅내역을 DB에서 가져옴

---

```jsx
    // 클라이언트가 방에 입장할 때: { room: 'roomName', username: 'userName' }
    socket.on('joinRoom', async ({ room, username }) => {
		    // db에 채팅방(room)이 있는지 알맞는 room인지 등 validation 검증
        socket.join(room);
        socket.username = username; // 현재 통신 들어온 소켓 객체의 이름, 방명 지정
        socket.room = room; // 나중에 채팅보내기나 채팅방 나가는 등 객체 식별 정보로 쓰임

        // 해당 채팅방의 이전 메시지들을 DB에서 가져오기
        try {
            const messages = await Message.find({ room }).sort({ createdAt: 1 }).limit(50);
            socket.emit('previousMessages', messages);
        } catch (err) {
            console.error(err);
        }

        // 입장 메시지 브로드캐스트 (입장한 클라이언트 제외)
        socket.to(room).emit('message', {
            username: 'system',
            message: `${username}님이 입장했습니다.`,
            createdAt: new Date(),
        });
    });

```

- `on`은 수신하는 이벤트 리스너 느낌이었습니다.
- `join`으로 해당 room에 소켓을 들여보냅니다.
- room에 맞는 메시지들을 createdAt 오름차순으로 정렬해 가져옵니다.
- 그리고 previousMessages라는 소켓 통신에 db에서 가져온 채팅 내역들을 담아 보냅니다.
    - 해당 메시지를 페이지에서 하나씩 리스트 순회해 div 만들고 해서 채팅내역으로 보여줍니다

### 3. 채팅 보내기

---

```jsx
    <div id="chatContainer" style="display: none;">
        <div id="chat"></div>
        <form id="messageForm">
            <input id="messageInput" type="text" placeholder="메시지 입력..." autocomplete="off" />
            <button type="submit">전송</button>
        </form>
    </div>
    
    ...
  
    // 메시지 전송
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = messageInput.value.trim();
        if (msg) {
            socket.emit('chatMessage', msg);
            messageInput.value = '';
        }
    });
    
    
    ----------------------------------- (하단은 서버)
    
        // 클라이언트가 메시지를 보낼 때
    socket.on('chatMessage', async (msg) => {
        const messageData = {
            username: socket.username,
            room: socket.room,
            message: msg,
            createdAt: new Date(),
        };

        // DB에 메시지 저장
        try {
            const message = new Message(messageData);
            await message.save();
        } catch (err) {
            console.error(err);
        }

        // 같은 방에 있는 모든 클라이언트에게 메시지 전송
        io.to(socket.room).emit('message', messageData);
    });
```

- 채팅을 msg 변수에 담아 chatMessage 소켓 통신에 담아 서버로 보냅니다.
- 서버에서 DB에 해당 채팅을 우선 저장합니다.
- 그리고 소켓 통신 최상단 객체였던 io의 `to` 메서드로 특정 room에 있는 소켓에게만 해당 메시지를 보냅니다.

### 4. 채팅 수신

---

```jsx
 // 새 메시지 수신
socket.on('message', (msg) => {
    addMessage(msg);
});
```

- 아까 이전 채팅 내역들을 화면에 표시하던 것과 같은 방식으로 화면에 띄웁니다.

## 마무리

---

- 웹소켓 채팅은 서버뿐 아니라 프론트 코드에서도 적절한 처리가 이뤄져야 하는 작업임을 알 수 있습니다.
***-완-***
