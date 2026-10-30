/* =========================================================
   設定檔：部署時只需要改這裡
   ========================================================= */
window.APP_CONFIG = {
  // Apps Script 部署後的「網頁應用程式網址」（以 /exec 結尾）。
  // 留空 = 示範模式：題目與作答資料只存在這台電腦的瀏覽器，方便先試用。
  API_URL: "https://script.google.com/macros/s/AKfycbwbm-Po-KYvvwlaYN1TbRkk4JLRiynDaSPFNP6QezlEkO1KNlMZ4V6UxFn0iyBPt7ThgQ/exec",

  // 螢幕寬度低於此值（px）或使用手機時，不允許作答
  MIN_WIDTH: 900,

  // 酬謝領取表單網址（與作答資料分開保存）；留空則不顯示
  REWARD_FORM_URL: "",

  // 是否在題組上方顯示「來源說明」（正式施測建議改為 false）
  SHOW_SOURCE_NOTE: false,

  // 試題文字大小（px）。版面其他尺寸都依此等比例縮放，維持學測試題本的比例
  EXAM_FONT_PX: 17
};
