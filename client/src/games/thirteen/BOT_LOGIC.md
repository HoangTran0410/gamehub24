# Thirteen (Tiến Lên) Bot Logic Documentation

Tài liệu này ghi lại chi tiết các chiến thuật và tính cách (personas) đã được triển khai cho AI trong trò chơi Thirteen (Tiến Lên Miền Nam).

## 1. Chiến thuật cốt lõi (Core Strategy)

### Tẩu Rác (Junk Disposal)
- **Ưu tiên**: Khi mở màn (lead) một vòng mới, bot luôn ưu tiên đánh lá bài **rác (lẻ) nhỏ nhất**.
- **Mục tiêu**: Tránh việc bị kẹt các lá bài nhỏ ở cuối trận khi đối thủ đã cầm các quân lớn.

### Găm Hàng (Card Preservation)
- **Cơ chế**: Bot giữ lại các lá bài mạnh (Heo, Át) và các bộ đặc biệt (Tứ quý, Đôi thông) để giành lại quyền kiểm soát hoặc kết thúc trận đấu.
- **Bảo vệ Heo**: Bot sẽ không đánh Heo (2) như một phần của Đôi hoặc Sám mở màn trừ khi:
    - Bài còn dưới 4 lá (giai đoạn kết thúc).
    - Có đối thủ chuẩn bị về (cần chặn đứng bằng mọi giá).

### Chốt (Endgame Blocking)
- **Cơ chế**: Khi có đối thủ chỉ còn 1 lá bài, bot sẽ chuyển sang chế độ phòng thủ cấp cao:
    - Nếu mở màn: Đánh lá bài **lớn nhất** có thể (lá Chốt).
    - Nếu chặn bài: Ưu tiên dùng các bộ (Sảnh, Đôi, Sám) để đối thủ không có cơ hội đánh lá lẻ cuối cùng.

---

## 2. Các tính cách Bot (Bot Personas)

Hệ thống sẽ chỉ định ngẫu nhiên 1 trong 3 tính cách cho mỗi bot khi bắt đầu ván đấu.

### Cẩn Thận (Cautious - Huy hiệu: "Kỹ")
- **Đặc trưng**: Rất quý bài, không thích mạo hiểm.
- **Hành vi**:
    - Thường xuyên bỏ lượt nếu thấy bài trên bàn đã cao (từ Át trở lên) để dành bài mạnh cho mình.
    - Giữ Heo và Hàng rất kỹ cho đến cuối trận.
- **Phòng thủ khẩn cấp**: Dù cẩn thận nhưng vẫn bị ép phải chặn bài nếu đối thủ chỉ còn 1 lá (Overridden priority).

### Hăng Hái (Aggressive - Huy hiệu: "Hăng")
- **Đặc trưng**: Thích giành quyền chủ động (cầm cái).
- **Hành vi**:
    - Sẵn sàng đánh bài cao hơn mức cần thiết để giành lượt.
    - Sử dụng Tứ quý hoặc Đôi thông sớm hơn để ép sân hoặc chặn đường đối thủ ngay từ giữa trận.

### Cân Bằng (Balanced - Huy hiệu: "Vừa")
- **Đặc trưng**: Chơi theo tính toán tối ưu.
- **Hành vi**: Áp dụng chuẩn xác các chiến thuật "Tẩu rác" và "Găm hàng" tùy theo tình hình bài trên tay.

---

## 3. Cấu trúc mã nguồn (Code Structure)

- **`types.ts`**: Định nghĩa `BotPersona` và thuộc tính `persona` trong `PlayerSlot`.
- **`Thirteen.ts`**:
    - `handleStartGame`: Chỉ định persona ngẫu nhiên.
    - `makeBotMove`: Điểm điều phối logic đánh bài của bot.
    - `findValidPlay`: Xử lý việc chọn bài chặn hoặc quyết định bỏ lượt (Persona-based).
    - `findBestOpeningPlay`: Xử lý logic chọn bộ bài mở màn (Persona-based & Strategy-based).
- **`ThirteenUI.tsx`**: Hiển thị huy hiệu Persona bên cạnh tên bot.

---

## 4. Ghi chú Debug

Khi kiểm tra lỗi logic của bot, hãy lưu ý:
1. **Kiểm tra Persona**: Xem bot đó đang là "Hăng", "Kỹ" hay "Vừa" để hiểu tại sao nó bỏ lượt hoặc đánh bài to.
2. **Trạng thái OpponentNearFinish**: Kiểm tra xem có ai còn 1 lá bài không, vì lúc này logic phòng thủ sẽ ghi đè tất cả các playstyle khác.
3. **Thanh lọc Heo**: Bot luôn ưu tiên xả rác trước, nếu nó đánh Heo sớm, hãy kiểm tra xem hand của nó có đang dưới 4 lá không.
