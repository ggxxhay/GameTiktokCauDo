/*
 * Cấu hình vận hành game. Có thể chỉnh các giá trị này mà không sửa script.js.
 * Sau khi thay đổi trên GitHub Pages, tải lại trang bằng Ctrl+F5.
 */
window.GAME_CONFIG = {
  // Thời gian trả lời, tính từ sau khi đọc xong câu hỏi và các lựa chọn.
  answerDurationSeconds: 10,

  // Thời gian chờ trước khi tự động mở vòng mới.
  roundRestartSeconds: 15,

  // Cấu hình giọng đọc.
  speechLanguage: 'vi-VN',
  speechRate: 0.92,
  speechPitch: 1,

  // Endpoint EulerStream; để nguyên nếu tài khoản đang dùng endpoint mặc định.
  liveWebSocketUrl: 'wss://ws.eulerstream.com?uniqueId={username}&apiKey={apiKey}',

  // Bật log payload comment trong Console để chẩn đoán cấu trúc event live.
  debugLiveMessages: false
};
