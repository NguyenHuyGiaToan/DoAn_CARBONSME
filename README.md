# CARBONSME — Hệ thống Quản lý Phát thải Khí nhà kính SME

Đồ án xây dựng ứng dụng web hỗ trợ doanh nghiệp vừa và nhỏ (SME) thu thập số liệu tiêu thụ năng lượng (Scope 1 & Scope 2), đối soát chứng từ, tính toán lượng phát thải khí nhà kính (`tCO2e`), trực quan hóa dữ liệu theo kỳ kiểm kê và gợi ý giải pháp tối ưu năng lượng.

---

## 1. Công nghệ sử dụng

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React
- **Cơ sở dữ liệu & Lưu trữ:** Supabase (PostgreSQL, Supabase Storage)
- **Tích hợp AI:** Google Gemini API (gọi trực tiếp qua REST API, hỗ trợ fallback giữa các model)
- **Kiểm tra chất lượng mã:** `tsc -b`, `oxlint`

---

## 2. Chức năng chính theo phân quyền (RBAC)

Hệ thống phân chia giao diện và quyền truy cập theo 3 vai trò:

### Nhân viên (`STAFF`)
- **`/staff/declare` — Khai báo & Lịch sử:**
  - Nhập dữ liệu tiêu thụ điện lưới EVN (`SCOPE_2`, đơn vị `kWh`) hoặc nhiên liệu xăng RON 95 / dầu DO (`SCOPE_1`, đơn vị `LIT`) theo kỳ kiểm kê và phòng ban.
  - Tải lên tệp chứng từ/hóa đơn gốc (`.jpg`, `.png`, `.pdf`, tối đa 5MB) lên Supabase Storage.
  - Theo dõi lịch sử khai báo và lọc theo trạng thái (`PENDING`, `APPROVED`, `REJECTED`).

### Quản lý (`MANAGER`)
- **`/manager/dashboard` — Bảng điều khiển:**
  - Thống kê các chỉ số KPI từ dữ liệu đã được phê duyệt (`APPROVED`): Tổng phát thải, Scope 1, Scope 2 (`tCO2e`) kèm % biến động so với kỳ liền kề.
  - Biểu đồ vành khuyên tỷ trọng Scope 1 / Scope 2 và biểu đồ cột xếp chồng xu hướng theo các kỳ kiểm kê (tự động cập nhật theo bộ lọc kỳ và phòng ban).
  - Bảng phân rã chi tiết theo phòng ban và chức năng xuất báo cáo `.CSV`.
- **`/manager/audit` — Đối soát & Kiểm duyệt MRV:**
  - Xem xét hồ sơ chờ duyệt, kiểm tra ảnh/tệp hóa đơn đính kèm.
  - Phê duyệt (`APPROVED`) kèm tính toán kết quả phát thải theo hệ số phát thải hiện hành, hoặc từ chối (`REJECTED`) kèm lý do.
- **`/manager/dss` — Trợ lý AI DSS:**
  - Tổng hợp số liệu phát thải đã duyệt theo kỳ kiểm kê được chọn.
  - Gửi dữ liệu tổng hợp tới Gemini API để phân tích điểm nóng phát thải và đề xuất các giải pháp hành động (lưu lại lịch sử khuyến nghị vào cơ sở dữ liệu).

### Quản trị viên (`ADMIN`)
- **`/admin/ef-config` — Quản trị Hệ số phát thải & Sao lưu:**
  - Xem, thêm mới và cập nhật danh mục hệ số phát thải (`emission_factors`) kèm tài liệu căn cứ pháp lý.
  - Trích xuất toàn bộ dữ liệu 6 bảng ra tệp sao lưu `.JSON`.
- **`/admin/users-depts` — Quản lý Tài khoản & Phòng ban:**
  - Quản lý danh sách tài khoản nội bộ (`STAFF`, `MANAGER`, `ADMIN`) và thông tin phòng ban.

---

## 3. Cấu trúc thư mục

```text
DoAn_CARBONSME/
├── public/                 # Tài nguyên tĩnh (favicon, icons)
├── src/
│   ├── components/         # Thành phần dùng chung (Sidebar, Toast)
│   ├── lib/                # Kết nối Supabase và gọi Gemini API
│   ├── pages/              # Các trang chức năng theo vai trò
│   ├── types/              # Định nghĩa kiểu TypeScript cho database
│   ├── App.tsx             # Định tuyến và kiểm tra phân quyền RBAC
│   ├── index.css           # Cấu hình Tailwind CSS v4 và theme
│   └── main.tsx            # Điểm khởi chạy ứng dụng
├── .env.example            # Mẫu các biến môi trường cần thiết
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 4. Hướng dẫn cài đặt và chạy dự án

### Yêu cầu trước khi cài đặt
- **Node.js** >= 18 và **npm**
- Một dự án **Supabase** (PostgreSQL + Storage)
- **Google Gemini API Key** (nếu sử dụng tính năng Trợ lý AI DSS)

### Các bước thực hiện

**Bước 1: Clone mã nguồn**
```bash
git clone https://github.com/NguyenHuyGiaToan/DoAn_CARBONSME.git
cd DoAn_CARBONSME
```

**Bước 2: Cài đặt thư viện**
```bash
npm install
```

**Bước 3: Cấu hình biến môi trường**
Sao chép tệp `.env.example` thành `.env.local` ở thư mục gốc và điền thông tin thực tế của bạn:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_GEMINI_API_KEY=your-gemini-api-key
```

**Bước 4: Chuẩn bị cơ sở dữ liệu trên Supabase**
Đảm bảo dự án Supabase có đầy đủ 6 bảng khớp với định nghĩa trong `src/types/database.ts`:
- `departments`
- `users`
- `emission_factors`
- `activity_records`
- `calculation_results`
- `ai_recommendations`

Và tạo Storage bucket tên `invoices` (bật quyền public read hoặc policy phù hợp để hiển thị chứng từ).

**Bước 5: Chạy ứng dụng**
```bash
# Chạy môi trường phát triển (mặc định tại http://localhost:5173)
npm run dev
```

Các lệnh kiểm tra khác:
```bash
# Kiểm tra lỗi lint
npm run lint

# Kiểm tra TypeScript và build bản production
npm run build
```
