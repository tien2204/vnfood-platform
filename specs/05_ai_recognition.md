# 05 — AI Nhận diện ảnh (Localhost — PyTorch)

## Pipeline

```
User upload ảnh
      │
      ▼
FastAPI nhận file → lưu tạm vào memory (không cần lưu disk)
      │
      ▼
EfficientNet-B0 (best_group_effb0.pth)
  Input: 224×224, normalize ImageNet
  Output: softmax 8 classes → group + confidence
      │
 [conf >= 0.5]          [conf < 0.5]
      │                       │
      ▼                       ▼
EfficientNet-B2           OpenAI Vision
(best_sub_{GROUP}_effb2)  fallback ngay
  Input: 260×260
  Output: softmax N classes
      │
 [conf >= 0.6]          [conf < 0.6]
      │                       │
      ▼                       ▼
VNFood result          OpenAI Vision fallback
      │
      ▼
Query recipes DB by predicted_class name
      │
      ▼
Trả về kết quả + top 6 recipes
```

## Model Loading (startup)

```python
# ai/inference.py
# Models được load 1 lần khi FastAPI khởi động (lifespan event)
# Lưu trong memory — không load lại mỗi request

import torch
import torchvision.transforms as T
from torchvision import models

class VNFoodPredictor:
    def __init__(self, weights_dir: str):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Load group model (EfficientNet-B0)
        self.group_model = self._load_effb0(
            os.path.join(weights_dir, 'best_group_effb0.pth'),
            num_classes=8
        )
        
        # Load 8 sub models (EfficientNet-B2)
        self.sub_models = {}
        for group, weight_file in GROUP_TO_WEIGHT.items():
            num_classes = len(GROUP_CLASSES[group])
            self.sub_models[group] = self._load_effb2(
                os.path.join(weights_dir, weight_file),
                num_classes=num_classes
            )
        
        # Transforms
        self.group_transform = T.Compose([
            T.Resize(256), T.CenterCrop(224),
            T.ToTensor(),
            T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
        self.sub_transform = T.Compose([
            T.Resize(300), T.CenterCrop(260),
            T.ToTensor(),
            T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    
    def _load_effb0(self, path, num_classes):
        model = models.efficientnet_b0(weights=None)
        model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, num_classes)
        model.load_state_dict(torch.load(path, map_location=self.device))
        model.eval().to(self.device)
        return model
    
    def _load_effb2(self, path, num_classes):
        model = models.efficientnet_b2(weights=None)
        model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, num_classes)
        model.load_state_dict(torch.load(path, map_location=self.device))
        model.eval().to(self.device)
        return model
    
    @torch.no_grad()
    def predict(self, pil_image) -> dict:
        # Step 1: predict group
        img_t = self.group_transform(pil_image).unsqueeze(0).to(self.device)
        group_probs = torch.softmax(self.group_model(img_t), dim=1)[0]
        group_conf, group_idx = group_probs.max(0)
        group_name = list(GROUP_CLASSES.keys())[group_idx.item()]
        group_conf = group_conf.item()
        
        if group_conf < 0.5:
            return {"needs_fallback": True}
        
        # Step 2: predict sub-class
        img_t2 = self.sub_transform(pil_image).unsqueeze(0).to(self.device)
        sub_model = self.sub_models[group_name]
        sub_probs = torch.softmax(sub_model(img_t2), dim=1)[0]
        sub_conf, sub_idx = sub_probs.max(0)
        class_name = GROUP_CLASSES[group_name][sub_idx.item()]
        sub_conf = sub_conf.item()
        
        # Top 5
        top5_vals, top5_idxs = sub_probs.topk(min(5, len(GROUP_CLASSES[group_name])))
        top5 = [
            {"class": GROUP_CLASSES[group_name][i], "confidence": v.item()}
            for v, i in zip(top5_vals, top5_idxs)
        ]
        
        if sub_conf < 0.6:
            return {"needs_fallback": True, "top5": top5}
        
        return {
            "needs_fallback": False,
            "group": group_name,
            "group_confidence": group_conf,
            "predicted_class": class_name,
            "class_confidence": sub_conf,
            "top5": top5,
        }
```

## OpenAI Fallback

```python
# services/ai_service.py
async def openai_recognize(image_bytes: bytes) -> dict:
    import base64
    b64 = base64.b64encode(image_bytes).decode()
    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                {"type": "text",
                 "text": 'Đây là ảnh món ăn Việt Nam. Trả về JSON: {"dish_name": "tên món tiếng Việt", "confidence": 0.0-1.0}'}
            ]
        }],
        response_format={"type": "json_object"},
        max_tokens=100,
    )
    return json.loads(response.choices[0].message.content)
```

## API Endpoints

### POST /api/v1/ai/recognize
```
Content-Type: multipart/form-data
Body: file (image)

Response: {
  "data": {
    "predicted_class": "banh-xeo",
    "display_name": "Bánh xèo",
    "confidence": 0.87,
    "model_used": "vnfood",
    "suggested_recipes": [
      { "id":"", "title":"", "image_url":"", "avg_rating":4.5, "cooking_time":30 }
    ]
  }
}
```

### POST /api/v1/ai/recognize-url
```json
Request:  { "image_url": "https://..." }
Response: (giống trên)
```

## Frontend Page
- `/recognize` — Drag & drop ảnh + hiển thị kết quả

## Edge Cases
- Ảnh < 100×100 px → reject 400
- File > 10MB → reject 400
- Model chưa load xong → 503
- Cả VNFood + OpenAI đều fail → "Không nhận diện được"
- Predicted class không có recipe trong DB → trả tên món + gợi ý cùng group
