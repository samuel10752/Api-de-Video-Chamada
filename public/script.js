document.addEventListener("DOMContentLoaded", () => {
    const socket = io.connect();
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const muteAudioButton = document.getElementById('muteAudio');
    const muteVideoButton = document.getElementById('muteVideo');
    const muteAudioWaiting = document.getElementById('muteAudioWaiting');
    const muteVideoWaiting = document.getElementById('muteVideoWaiting');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const sendButton = document.getElementById('sendButton');
    const waitingScreen = document.getElementById('waitingScreen');
    const videoChatContainer = document.getElementById('videoChatContainer');

    let localStream;
    let remoteStream;
    let peerConnection;
    let audioMuted = false;
    let videoMuted = false;
    let isMaster = false;
    let isApproved = false;

    // Obter o roomId da URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('roomId');
    if (!roomId) {
        alert("Erro: Nenhum ID de sala fornecido.");
        throw new Error("Room ID is required.");
    }

    // Conectar à sala
    socket.emit('join-room', roomId);

    // Receber a notificação do servidor sobre o papel do usuário
    socket.on('user-role', ({ isMaster: role }) => {
        isMaster = role;

        if (isMaster) {
            videoChatContainer.style.display = 'block'; // Mestre vê a tela principal
        } else {
            // Se o usuário for um convidado, mostrar a tela de espera
            waitingScreen.style.display = 'block';
        }
    });

    // Mestre aprova ou recusa a entrada de um usuário
    socket.on('request-to-join', (userId) => {
        if (isMaster) {
            const accept = confirm(`Solicitação de entrada de: ${userId}. Aceitar?`);
            if (accept) {
                socket.emit('approve-user', { roomId, userId });
            } else {
                socket.emit('reject-user', { roomId, userId });
            }
        }
    });

    // Exibe uma mensagem para o convidado caso seja recusado
    socket.on('entry-rejected', () => {
        alert("Sua solicitação de entrada foi recusada.");
        waitingScreen.innerHTML = "<h2>Sua solicitação foi recusada.</h2>";
    });

    // Aprovação do mestre para o convidado entrar
    socket.on('approve-entry', () => {
        isApproved = true;
        waitingScreen.style.display = 'none';
        videoChatContainer.style.display = 'block';
    });

    // Obter stream local e exibir no vídeo local
    navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true
    }).then(stream => {
        localVideo.srcObject = stream;
        localStream = stream;
        localVideo.style.display = 'block';
        socket.emit('ready', roomId); // Notifica que o usuário está pronto para a chamada
    }).catch(error => console.error("Erro ao obter mídia:", error));

    // Controle de Mute de Áudio
    muteAudioButton.addEventListener('click', () => {
        toggleAudio();
    });
    muteAudioWaiting.addEventListener('click', () => {
        toggleAudio();
    });

    function toggleAudio() {
        audioMuted = !audioMuted;
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = !audioMuted);
            const icon = audioMuted ? 'fa-microphone-slash' : 'fa-microphone';
            muteAudioButton.innerHTML = `<i class="fas ${icon}"></i>`;
            muteAudioWaiting.innerHTML = `<i class="fas ${icon}"></i>`;
        }
    }

    // Controle de Mute de Vídeo
    muteVideoButton.addEventListener('click', () => {
        toggleVideo();
    });
    muteVideoWaiting.addEventListener('click', () => {
        toggleVideo();
    });

    function toggleVideo() {
        videoMuted = !videoMuted;
        if (localStream) {
            localStream.getVideoTracks().forEach(track => track.enabled = !videoMuted);
            const icon = videoMuted ? 'fa-video-slash' : 'fa-video';
            muteVideoButton.innerHTML = `<i class="fas ${icon}"></i>`;
            muteVideoWaiting.innerHTML = `<i class="fas ${icon}"></i>`;
        }
    }

    // Iniciar a chamada com outro usuário
    socket.on('user-connected', () => {
        if (isApproved || isMaster) {
            startCall();
            remoteVideo.style.display = 'block';
        }
    });

    function startCall() {
        if (peerConnection) return;

        peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = event => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideo.srcObject = remoteStream;
            }
            remoteStream.addTrack(event.track);
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('ice-candidate', { candidate: event.candidate, roomId });
            }
        };

        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => socket.emit('offer', { offer: peerConnection.localDescription, roomId }));
    }
});
