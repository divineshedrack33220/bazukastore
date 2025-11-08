// utils/socket.js
let io;

const setIo = (socketIo) => {
    io = socketIo;
};

const getIo = () => {
    if (!io) throw new Error('Socket.IO not initialized');
    return io;
};

module.exports = { setIo, getIo };