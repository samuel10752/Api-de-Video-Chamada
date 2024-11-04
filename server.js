const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {}; // Armazena dados da sala, incluindo o mestre e o histórico de chat

app.use(express.static('public'));

io.on('connection', (socket) => {
    // Criar ou entrar na sala
    socket.on('join-room', (roomId) => {
        if (!rooms[roomId]) {
            // Definir o primeiro usuário como mestre
            rooms[roomId] = { master: socket.id, chatHistory: [] };
        }

        // Atribuir o status de "mestre" ou "convidado"
        const isMaster = socket.id === rooms[roomId].master;
        socket.join(roomId);

        // Informar ao usuário se ele é o mestre
        socket.emit('user-role', { isMaster });

        // Enviar o histórico de chat para o novo participante
        socket.emit('chat-history', rooms[roomId].chatHistory);

        // Informar ao mestre que um novo usuário quer entrar (se não for o mestre)
        if (!isMaster) {
            io.to(rooms[roomId].master).emit('request-to-join', socket.id);
        }
    });

    // Lidar com mensagens de chat e adicionar ao histórico
    socket.on('chat-message', ({ message, roomId }) => {
        const chatMessage = { sender: socket.id, message };
        rooms[roomId].chatHistory.push(chatMessage); // Salvar no histórico da sala
        io.to(roomId).emit('chat-message', chatMessage); // Enviar para todos na sala
    });

    // Encaminhamento de candidatos ICE
    socket.on('ice-candidate', (data) => socket.to(data.roomId).emit('ice-candidate', data));

    // Encaminhamento de oferta e resposta WebRTC
    socket.on('offer', (data) => socket.to(data.roomId).emit('offer', data));
    socket.on('answer', (data) => socket.to(data.roomId).emit('answer', data));

    // Lidar com desconexões
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            room.chatHistory = room.chatHistory.filter(msg => msg.sender !== socket.id);

            // Transferir administração se o mestre sair e houver outros membros na sala
            if (room.master === socket.id && room.members && room.members.length > 0) {
                room.master = room.members[0];
                io.to(room.master).emit('user-role', { isMaster: true });
            }

            // Limpar sala vazia
            if (room.members && room.members.length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

server.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));
