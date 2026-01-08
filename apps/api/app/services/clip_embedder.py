from __future__ import annotations

import os
from functools import lru_cache
from typing import Tuple

import numpy as np
import torch
import open_clip
from PIL import Image


MODEL_NAME = os.environ.get("AI_CLIP_MODEL", "ViT-B-32")
PRETRAINED = os.environ.get("AI_CLIP_PRETRAINED", "openai")


@lru_cache(maxsize=1)
def _load() -> Tuple[torch.nn.Module, object, str]:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(
        MODEL_NAME, pretrained=PRETRAINED, device=device
    )
    model.eval()
    return model, preprocess, device


def embed_pil(img: Image.Image) -> np.ndarray:
    model, preprocess, device = _load()
    img = img.convert("RGB")
    with torch.no_grad():
        x = preprocess(img).unsqueeze(0).to(device)
        feat = model.encode_image(x)
        feat = feat / feat.norm(dim=-1, keepdim=True)  # normalize for IP search
    return feat.detach().cpu().numpy().astype("float32")[0]
