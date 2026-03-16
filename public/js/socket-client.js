// Singleton Socket.io client
// socket.io script must be loaded before this file in game.html and lobby.html
// For index.html we delay-load it

window.SocketClient = (function () {
  let socket = null;

  function get() {
    if (!socket) {
      if (typeof io === 'undefined') {
        console.warn('Socket.io not loaded yet');
        return null;
      }
      socket = io({ autoConnect: true });
    }
    return socket;
  }

  return { get };
})();
