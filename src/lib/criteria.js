export const CRITERIA = [
  { key: 'content_theme', section: 'I. PHẦN NỘI DUNG VÀ Ý NGHĨA', title: 'Nội dung & Chủ đề', max: 30, description: 'Đúng chủ đề, nổi bật tình thầy trò, môi trường học đường, sự tận tụy của nhà giáo và thông điệp tri ân sâu sắc.' },
  { key: 'emotion_humanity', section: 'I. PHẦN NỘI DUNG VÀ Ý NGHĨA', title: 'Cảm xúc & Nhân văn', max: 20, description: 'Gợi sự đồng cảm, chân thực, giàu tính nhân văn và lan tỏa tinh thần tích cực.' },
  { key: 'image_quality', section: 'II. PHẦN HÌNH ẢNH, KỸ THUẬT & THÔNG ĐIỆP', title: 'Chất lượng hình ảnh & Góc chụp', max: 20, description: 'Bố cục, ánh sáng, góc chụp nét; bắt trọn khoảnh khắc tự nhiên, ý nghĩa.' },
  { key: 'creativity', section: 'II. PHẦN HÌNH ẢNH, KỸ THUẬT & THÔNG ĐIỆP', title: 'Tính sáng tạo & Dấu ấn', max: 15, description: 'Góc nhìn độc đáo, sáng tạo, thể hiện ấn tượng riêng của tác giả.' },
  { key: 'message', section: 'II. PHẦN HÌNH ẢNH, KỸ THUẬT & THÔNG ĐIỆP', title: 'Lời giới thiệu & Thông điệp', max: 15, description: 'Ngắn gọn, cô đọng, bám sát hình ảnh, làm rõ giá trị bài thi.' }
];
export const MAX_SCORE = 100;
export const totalScore = (values) => CRITERIA.reduce((sum, c) => sum + (Number(values?.[c.key]) || 0), 0);
export const isComplete = (values) => CRITERIA.every(c => values?.[c.key] !== null && values?.[c.key] !== undefined && values?.[c.key] !== '');
