# CHƯƠNG 1. GIỚI THIỆU ĐỀ TÀI

## 1.1 Đặt vấn đề

Ẩm thực là một phần quan trọng trong đời sống hằng ngày và văn hóa của mỗi quốc gia. Tại Việt Nam, sự đa dạng về vùng miền, nguyên liệu và cách chế biến tạo nên kho tàng món ăn phong phú. Người dùng có thể tiếp cận công thức nấu ăn từ sách, website, mạng xã hội hoặc các nền tảng chia sẻ nội dung. Tuy nhiên, lượng thông tin lớn không đồng nghĩa với việc người dùng luôn tìm được công thức phù hợp với nhu cầu thực tế.

Trong quá trình nấu ăn, người dùng thường gặp nhiều tình huống cần được hỗ trợ. Một người có thể nhìn thấy một món ăn qua hình ảnh nhưng không biết chính xác tên món hoặc cách chế biến. Một người khác có sẵn một số nguyên liệu trong bếp nhưng chưa xác định được nên nấu món gì. Ngoài ra, việc lên thực đơn cho nhiều ngày, cân đối các bữa ăn và chuẩn bị danh sách nguyên liệu cần mua cũng là công việc tốn thời gian. Những nhu cầu này xuất hiện thường xuyên trong sinh hoạt gia đình, đặc biệt với người muốn tự nấu ăn nhưng chưa có nhiều kinh nghiệm tổ chức bữa ăn.

Các nguồn công thức hiện nay thường được trình bày rời rạc. Một công thức có thể thiếu thông tin về thời gian nấu, khẩu phần, độ khó hoặc danh sách nguyên liệu rõ ràng. Nhiều công thức cùng mô tả một món ăn nhưng cách đặt tên, chia bước và ghi nguyên liệu không thống nhất. Khi người dùng cần tìm kiếm theo nguyên liệu, theo món ăn hoặc theo kế hoạch bữa ăn trong tuần, sự thiếu thống nhất này làm giảm hiệu quả tra cứu.

Một hạn chế khác là nhiều nền tảng công thức chỉ tập trung vào việc lưu trữ và hiển thị nội dung. Các nhu cầu trước và sau khi chọn công thức chưa được kết nối đầy đủ. Trước khi chọn món, người dùng có thể cần nhận diện món ăn từ hình ảnh hoặc tìm món từ nguyên liệu sẵn có. Sau khi chọn món, người dùng cần lập kế hoạch bữa ăn, tổng hợp danh sách mua sắm và thao tác thuận tiện trong quá trình nấu. Nếu các bước này không nằm trong một quy trình thống nhất, trải nghiệm nấu ăn bị gián đoạn và phụ thuộc nhiều vào thao tác thủ công.

Đối với ẩm thực Việt Nam, bài toán còn có đặc thù riêng. Nhiều món ăn có tên gọi gần nhau, biến thể vùng miền khác nhau hoặc hình ảnh tương đối giống nhau. Một số món có thể được chế biến bằng nhiều nhóm nguyên liệu thay thế. Vì vậy, việc nhận diện món ăn, gợi ý công thức và tổ chức dữ liệu cần được thiết kế phù hợp với ngữ cảnh món Việt. Nếu chỉ dựa vào dữ liệu chung hoặc mô hình nhận diện tổng quát, hệ thống có thể chưa đáp ứng tốt nhu cầu tra cứu món ăn Việt Nam.

Từ thực tế trên, bài toán đặt ra là xây dựng một hệ thống hỗ trợ người dùng trong quy trình từ nhận biết món ăn, tìm kiếm công thức, gợi ý món theo nguyên liệu, lập kế hoạch bữa ăn đến chuẩn bị danh sách mua sắm. Hệ thống cần phục vụ người dùng phổ thông muốn nấu ăn hằng ngày và quản trị viên cần kiểm soát chất lượng nội dung.

## 1.2 Mục tiêu và phạm vi đề tài

Hiện nay, người dùng có thể sử dụng nhiều loại sản phẩm để phục vụ việc nấu ăn. Website công thức cung cấp kho dữ liệu lớn và khả năng tìm kiếm theo tên món. Mạng xã hội cho phép người dùng chia sẻ hình ảnh, kinh nghiệm và phản hồi. Một số ứng dụng khác hỗ trợ lập kế hoạch bữa ăn hoặc tạo danh sách mua sắm. Bên cạnh đó, các mô hình trí tuệ nhân tạo có thể hỗ trợ nhận diện ảnh và xử lý ngôn ngữ tự nhiên trong một số tình huống.

Tuy nhiên, các sản phẩm trên thường giải quyết từng phần của quy trình nấu ăn. Công cụ nhận diện ảnh có thể trả về tên món nhưng chưa gắn trực tiếp với công thức và kế hoạch nấu ăn. Nền tảng chia sẻ công thức chưa chắc hỗ trợ gợi ý theo nguyên liệu sẵn có. Ứng dụng lập kế hoạch bữa ăn thường chưa liên kết chặt chẽ với kho công thức món Việt và danh sách nguyên liệu của từng món. Vì vậy, người dùng vẫn phải chuyển đổi giữa nhiều công cụ khác nhau.

Đề tài hướng tới xây dựng website hỗ trợ nhận diện ảnh món ăn và tư vấn nấu món ăn trong ngữ cảnh ẩm thực Việt Nam. Mục tiêu của hệ thống là tạo ra một nền tảng thống nhất, trong đó người dùng có thể tìm kiếm công thức, nhận gợi ý từ ảnh hoặc nguyên liệu, quản lý công thức cá nhân, tương tác với cộng đồng và lập kế hoạch bữa ăn. Hệ thống đồng thời hỗ trợ quản trị viên kiểm duyệt nội dung và quản lý dữ liệu.

Các mục tiêu cụ thể của đề tài gồm xây dựng chức năng xác thực và phân quyền; xây dựng kho công thức có tìm kiếm, lọc và xem chi tiết; cho phép người dùng đăng và quản lý công thức cá nhân; hỗ trợ nhận diện ảnh món ăn; gợi ý công thức theo nguyên liệu; hỗ trợ đánh giá, bình luận, lưu công thức và theo dõi người dùng; lập kế hoạch bữa ăn và sinh danh sách mua sắm; hỗ trợ chế độ nấu ăn theo từng bước; đồng thời xây dựng trang quản trị để kiểm duyệt công thức, quản lý người dùng, bình luận và nguyên liệu.

Phạm vi người dùng của hệ thống gồm ba nhóm chính. Khách vãng lai có thể xem và tìm kiếm công thức công khai. Người dùng đã đăng nhập có thể lưu công thức, bình luận, đánh giá, đăng công thức, lập kế hoạch bữa ăn và quản lý hồ sơ. Quản trị viên có quyền truy cập trang quản trị để kiểm soát nội dung và người dùng.

Phạm vi dữ liệu của đề tài tập trung vào công thức món ăn Việt Nam và các món ăn có liên quan trong kho dữ liệu của hệ thống. Dữ liệu công thức bao gồm tên món, mô tả, hình ảnh, nguyên liệu, các bước nấu, thời gian nấu, khẩu phần, độ khó, nhóm món và thông tin tác giả. Đối với bài toán nhận diện ảnh, hệ thống tập trung vào các nhóm món ăn được huấn luyện và các trường hợp có thể xử lý bằng cơ chế nhận diện bổ trợ.

Đề tài không bao gồm thanh toán trực tuyến, quản lý đơn hàng, vận chuyển hoặc tích hợp trực tiếp với nhà bán lẻ. Chức năng mua nguyên liệu trong đề tài được hiểu là hỗ trợ người dùng tra cứu và mở liên kết mua sắm từ danh sách nguyên liệu, không phải xử lý giao dịch thương mại trong hệ thống.

## 1.3 Định hướng giải pháp

Để giải quyết bài toán đã nêu, đề tài định hướng xây dựng hệ thống theo mô hình ứng dụng web nhiều lớp. Phần giao diện người dùng hiển thị công thức, nhận thao tác và kết nối với backend thông qua API. Phần backend xử lý nghiệp vụ, xác thực, phân quyền, quản lý dữ liệu và điều phối các chức năng trí tuệ nhân tạo. Cơ sở dữ liệu lưu trữ người dùng, công thức, nguyên liệu, tương tác xã hội, kế hoạch bữa ăn, danh sách mua sắm và nhật ký nhận diện.

Hệ thống sử dụng kiến trúc RESTful API để tách biệt frontend và backend. Cách tổ chức này giúp các chức năng được chia thành các nhóm rõ ràng như xác thực, công thức, nhận diện ảnh, nguyên liệu, kế hoạch bữa ăn, danh sách mua sắm, người dùng và quản trị. Việc tách lớp cũng giúp quá trình kiểm thử, bảo trì và mở rộng hệ thống thuận lợi hơn.

Đối với chức năng nhận diện ảnh món ăn, hệ thống định hướng kết hợp mô hình học sâu được huấn luyện cho món ăn Việt Nam với cơ chế nhận diện bổ trợ khi độ tin cậy thấp. Kết quả nhận diện được liên kết với kho công thức để trả về các công thức gợi ý, qua đó hỗ trợ người dùng chuyển từ việc nhận biết món ăn sang bước tìm hiểu cách chế biến.

Đối với chức năng gợi ý theo nguyên liệu, hệ thống khai thác dữ liệu nguyên liệu trong các công thức đã lưu. Người dùng nhập hoặc chọn các nguyên liệu đang có, hệ thống tìm các công thức phù hợp và chỉ ra mức độ khớp giữa nguyên liệu của người dùng với nguyên liệu cần có.

Đối với chức năng lập kế hoạch bữa ăn, hệ thống cho phép người dùng tạo kế hoạch theo tuần và thêm công thức vào từng bữa. Từ các công thức trong kế hoạch, hệ thống tổng hợp nguyên liệu để tạo danh sách mua sắm. Người dùng có thể đánh dấu nguyên liệu đã mua, thêm nguyên liệu thủ công và mở liên kết tra cứu nơi mua nguyên liệu.

Đối với nội dung cộng đồng, hệ thống cho phép người dùng đăng công thức và tương tác thông qua bình luận, đánh giá, lưu công thức và theo dõi người dùng khác. Vì nội dung do người dùng tạo có thể không đồng đều về chất lượng, hệ thống cần có cơ chế quản trị để duyệt công thức, xử lý bình luận, quản lý tài khoản và chuẩn hóa nguyên liệu.

Về công nghệ, hệ thống định hướng sử dụng Next.js cho frontend, FastAPI cho backend, PostgreSQL cho cơ sở dữ liệu, PyTorch cho mô hình nhận diện ảnh và JWT cho xác thực. Docker và Docker Compose được sử dụng để hỗ trợ cấu hình môi trường phát triển và triển khai thử nghiệm.

## 1.4 Bố cục đồ án

Báo cáo đồ án được tổ chức thành sáu chương. Chương 1 giới thiệu bối cảnh, mục tiêu, phạm vi và định hướng giải pháp của đề tài. Chương 2 trình bày khảo sát và phân tích yêu cầu, bao gồm nhóm người dùng, use case, quy trình nghiệp vụ và đặc tả chức năng. Chương 3 trình bày các công nghệ sử dụng trong hệ thống. Chương 4 trình bày thiết kế, triển khai, kiểm thử và đánh giá hệ thống. Chương 5 trình bày các giải pháp và đóng góp nổi bật như nhận diện món ăn Việt Nam, chuẩn hóa công thức và cơ chế nhận diện bổ trợ. Chương 6 tổng kết kết quả đạt được, nêu hạn chế và đề xuất hướng phát triển.
