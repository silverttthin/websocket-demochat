// app.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MongoDB 연결 (Docker로 실행한 MongoDB)
const mongoUrl = process.env.MONGO_URL || 'mongodb://root:1533@127.0.0.1:27017/chat?authSource=admin';
mongoose.connect(mongoUrl, {useNewUrlParser: true,
    useUnifiedTopology: true,});


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