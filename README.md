# EXAMWORD

## Deploy giao diện lên GitHub Pages

Workflow trong `.github/workflows/deploy-pages.yml` tự build thư mục `frontend` và deploy khi có commit mới lên `main`.

Trong repository, mở **Settings → Pages**, đổi **Source** thành **GitHub Actions**. Sau khi workflow chạy thành công, giao diện có tại:

https://huyyyyyyyyyyyyyyyyyyy.github.io/EXAMWORD/

GitHub Pages chỉ host giao diện tĩnh. Để đăng nhập, lưu dữ liệu và sử dụng API, cần deploy backend riêng và cấu hình `VITE_API_URL` trỏ đến API đó.
