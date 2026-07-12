from collections import OrderedDict

GROUP_CLASSES = OrderedDict({
    'BANH': [
        'banh-bao', 'banh-beo', 'banh-bo', 'banh-bot-loc', 'banh-can',
        'banh-canh', 'banh-chung', 'banh-cong', 'banh-cuon', 'banh-da-cua',
        'banh-da-lon', 'banh-duc', 'banh-gai', 'banh-giay', 'banh-gio',
        'banh-hoi', 'banh-khot', 'banh-la', 'banh-mi', 'banh-mi-chao',
        'banh-pia', 'banh-tai-heo', 'banh-tet', 'banh-tieu',
        'banh-tom-ho-tay', 'banh-trang-nuong', 'banh-troi-nuoc',
        'banh-trung-thu', 'banh-u', 'banh-xeo', 'cao-lau',
    ],
    'BUN_PHO': [
        'pho', 'bun-bo-hue', 'bun-cha', 'bun-cha-ca',
        'bun-dau-mam-tom', 'bun-mam', 'bun-rieu', 'bun-thit-nuong',
        'hu-tieu', 'mi-quang', 'mi-xao-gion', 'nui-xao', 'nam-pia', 'banh-canh',
    ],
    'COM': [
        'com-chay-cha-bong', 'com-chien', 'com-ga-xoi-mo',
        'com-lam', 'com-rang-dua-bo', 'com-tam',
    ],
    'MON_KHO_NUONG': [
        'bo-kho', 'bo-la-lot', 'bo-luc-lac', 'bo-ne', 'bo-nuong-la-lot',
        'ca-kho-to', 'ca-loc-nuong', 'ca-muoi-xoi', 'ca-sot-ca-chua',
        'ga-chien-nuoc-mam', 'kho-muc-nuong', 'kho-quet', 'lap-xuong',
        'luon-xao-xa-ot', 'muc-nhoi-thit', 'rau-muong-xao', 'thit-kho-tau',
    ],
    'CANH_CHAO': [
        'canh-bi-do', 'canh-chua', 'canh-cua', 'canh-kho-hoa',
        'canh-khoai-tim', 'ca-ri-ga', 'chao-long', 'chao-vit',
        'sup-cua', 'bo-kho', 'luon-om-chuoi-dau',
    ],
    'XOI': ['xoi-gac', 'xoi-nep-than', 'xoi-xeo'],
    'GOI_CUON': [
        'goi-ca-chich', 'goi-cuon', 'nem-chua', 'nem-nuong-nha-trang',
        'cha-com', 'cha-lui',
    ],
    'DAC_BIET': [
        'baba-nau-chuoi-dau', 'ca-muoi-xoi', 'cha-ca-la-vong',
        'cua-hap-bia', 'cut-lon-xao-me', 'ga-hap-la-chanh', 'khau-nhuc',
        'mam-chung', 'mam-tep-chung-thit', 'oc-buou-hap', 'oc-huong-xao',
        'oc-len-xao-dua', 'tau-hu-nhoi-thit', 'tau-hu-non', 'thit-dong',
        'thit-trau-gac-bep', 'tiet-canh', 'trung-vit-lon',
    ],
})

GROUP_TO_WEIGHT = {
    'BANH':          'best_sub_BANH_effb2.pth',
    'BUN_PHO':       'best_sub_BUN_PHO_effb2.pth',
    'COM':           'best_sub_COM_effb2.pth',
    'MON_KHO_NUONG': 'best_sub_MON_KHO_NUONG_effb2.pth',
    'CANH_CHAO':     'best_sub_CANH_CHAO_effb2.pth',
    'XOI':           'best_sub_XOI_effb2.pth',
    'GOI_CUON':      'best_sub_GOI_CUON_effb2.pth',
    'DAC_BIET':      'best_sub_DAC_BIET_effb2.pth',
}

GROUP_MODEL_FILE = 'best_group_effb0.pth'

CLASS_DISPLAY_NAMES = {
    'banh-bao': 'Bánh bao', 'banh-beo': 'Bánh bèo',
    'banh-bo': 'Bánh bò', 'banh-bot-loc': 'Bánh bột lọc',
    'banh-can': 'Bánh căn', 'banh-canh': 'Bánh canh',
    'banh-chung': 'Bánh chưng', 'banh-cong': 'Bánh cống',
    'banh-cuon': 'Bánh cuốn', 'banh-da-cua': 'Bánh đa cua',
    'banh-da-lon': 'Bánh da lợn', 'banh-duc': 'Bánh đúc',
    'banh-gai': 'Bánh gai', 'banh-giay': 'Bánh giầy',
    'banh-gio': 'Bánh giò', 'banh-hoi': 'Bánh hỏi',
    'banh-khot': 'Bánh khọt', 'banh-la': 'Bánh lá',
    'banh-mi': 'Bánh mì', 'banh-mi-chao': 'Bánh mì chảo',
    'banh-pia': 'Bánh pía', 'banh-tai-heo': 'Bánh tai heo',
    'banh-tet': 'Bánh tét', 'banh-tieu': 'Bánh tiêu',
    'banh-tom-ho-tay': 'Bánh tôm Hồ Tây',
    'banh-trang-nuong': 'Bánh tráng nướng',
    'banh-troi-nuoc': 'Bánh trôi nước',
    'banh-trung-thu': 'Bánh trung thu',
    'banh-u': 'Bánh ú', 'banh-xeo': 'Bánh xèo',
    'cao-lau': 'Cao lầu',
    'pho': 'Phở', 'bun-bo-hue': 'Bún bò Huế',
    'bun-cha': 'Bún chả', 'bun-cha-ca': 'Bún chả cá',
    'bun-dau-mam-tom': 'Bún đậu mắm tôm',
    'bun-mam': 'Bún mắm', 'bun-rieu': 'Bún riêu',
    'bun-thit-nuong': 'Bún thịt nướng',
    'hu-tieu': 'Hủ tiếu', 'mi-quang': 'Mì Quảng',
    'mi-xao-gion': 'Mì xào giòn', 'nui-xao': 'Nui xào',
    'nam-pia': 'Nậm pịa',
    'com-chay-cha-bong': 'Cơm cháy chà bông',
    'com-chien': 'Cơm chiên', 'com-ga-xoi-mo': 'Cơm gà xối mỡ',
    'com-lam': 'Cơm lam', 'com-rang-dua-bo': 'Cơm rang dưa bò',
    'com-tam': 'Cơm tấm',
    'bo-kho': 'Bò kho', 'bo-la-lot': 'Bò lá lốt',
    'bo-luc-lac': 'Bò lúc lắc', 'bo-ne': 'Bò né',
    'bo-nuong-la-lot': 'Bò nướng lá lốt',
    'ca-kho-to': 'Cá kho tộ', 'ca-loc-nuong': 'Cá lóc nướng',
    'ca-muoi-xoi': 'Cá muối xổi', 'ca-sot-ca-chua': 'Cá sốt cà chua',
    'ga-chien-nuoc-mam': 'Gà chiên nước mắm',
    'kho-muc-nuong': 'Khô mực nướng', 'kho-quet': 'Kho quẹt',
    'lap-xuong': 'Lạp xưởng', 'luon-xao-xa-ot': 'Lươn xào xả ớt',
    'muc-nhoi-thit': 'Mực nhồi thịt', 'rau-muong-xao': 'Rau muống xào',
    'thit-kho-tau': 'Thịt kho tàu',
    'canh-bi-do': 'Canh bí đỏ', 'canh-chua': 'Canh chua',
    'canh-cua': 'Canh cua', 'canh-kho-hoa': 'Canh khổ hoa',
    'canh-khoai-tim': 'Canh khoai tím', 'ca-ri-ga': 'Cà ri gà',
    'chao-long': 'Cháo lòng', 'chao-vit': 'Cháo vịt',
    'sup-cua': 'Súp cua', 'luon-om-chuoi-dau': 'Lươn om chuối đậu',
    'xoi-gac': 'Xôi gấc', 'xoi-nep-than': 'Xôi nếp than',
    'xoi-xeo': 'Xôi xéo',
    'goi-ca-chich': 'Gỏi cá chích', 'goi-cuon': 'Gỏi cuốn',
    'nem-chua': 'Nem chua', 'nem-nuong-nha-trang': 'Nem nướng Nha Trang',
    'cha-com': 'Chả cốm', 'cha-lui': 'Chả lụi',
    'baba-nau-chuoi-dau': 'Ba ba nấu chuối đậu',
    'cha-ca-la-vong': 'Chả cá Lã Vọng',
    'cua-hap-bia': 'Cua hấp bia',
    'cut-lon-xao-me': 'Cút lộn xào me',
    'ga-hap-la-chanh': 'Gà hấp lá chanh',
    'khau-nhuc': 'Khâu nhục', 'mam-chung': 'Mắm chưng',
    'mam-tep-chung-thit': 'Mắm tép chưng thịt',
    'oc-buou-hap': 'Ốc bươu hấp', 'oc-huong-xao': 'Ốc hương xào',
    'oc-len-xao-dua': 'Ốc len xào dừa',
    'tau-hu-nhoi-thit': 'Tàu hũ nhồi thịt',
    'tau-hu-non': 'Tàu hũ non', 'thit-dong': 'Thịt đông',
    'thit-trau-gac-bep': 'Thịt trâu gác bếp',
    'tiet-canh': 'Tiết canh', 'trung-vit-lon': 'Trứng vịt lộn',
}




# ── Group / class-mapping helpers (P2: scope /recipes to 103) ──────────────────
ALL_103_SLUGS: set[str] = set(CLASS_DISPLAY_NAMES.keys())
VALID_GROUPS: set[str] = set(GROUP_CLASSES.keys())

# slug → group (a few slugs live in two groups; first group wins).
GROUP_OF_SLUG: dict[str, str] = {}
for _grp, _slug_list in GROUP_CLASSES.items():
    for _slug in _slug_list:
        GROUP_OF_SLUG.setdefault(_slug, _grp)

# display name → slug, plus display names sorted longest-first so a more specific
# dish ("Bánh mì chảo") matches before a shorter prefix ("Bánh mì").
_DISPLAY_TO_SLUG: dict[str, str] = {}
for _slug, _disp in CLASS_DISPLAY_NAMES.items():
    _DISPLAY_TO_SLUG.setdefault(_disp, _slug)
_DISPLAY_NAMES_LONGEST_FIRST: list[str] = sorted(
    _DISPLAY_TO_SLUG.keys(), key=len, reverse=True
)


def slugs_for_group(group: str) -> list[str]:
    """All 103-class slugs belonging to a GROUP_CLASSES group ([] if unknown)."""
    return list(GROUP_CLASSES.get(group, []))


def resolve_ai_class(title: str | None, canonical_dish_slug: str | None) -> str | None:
    """Map a recipe to its parent 103-class slug, or None if outside the 103.

    1. exact canonical_dish_slug ∈ 103 → that slug.
    2. else title starts with a class display name (accent-sensitive,
       case-insensitive, longest name first) → that class.
    3. else None.
    """
    if canonical_dish_slug in ALL_103_SLUGS:
        return canonical_dish_slug
    t = (title or "").strip().lower()
    if not t:
        return None
    for name in _DISPLAY_NAMES_LONGEST_FIRST:
        if t.startswith(name.lower()):
            return _DISPLAY_TO_SLUG[name]
    return None


def get_keyword_from_class(class_slug: str) -> str:
    """Map class slug → keyword tiếng Việt cho query DB."""
    direct = {
        'pho': 'Phở',
        'hu-tieu': 'Hủ tiếu',
        'mi-quang': 'Mì Quảng',
        'mi-xao-gion': 'Mì xào giòn',
        'nui-xao': 'Nui xào',
        'nam-pia': 'Nậm pịa',
        'cao-lau': 'Cao lầu',
    }
    if class_slug in direct:
        return direct[class_slug]
    if class_slug.startswith('banh-'):
        return 'Bánh'
    if class_slug.startswith('bun-'):
        return 'Bún'
    if class_slug.startswith('com-'):
        return 'Cơm'
    if class_slug.startswith('canh-'):
        return 'Canh'
    if class_slug.startswith('chao-'):
        return 'Cháo'
    if class_slug.startswith('xoi-'):
        return 'Xôi'
    if class_slug.startswith('goi-'):
        return 'Gỏi'
    if class_slug.startswith('ca-'):
        return 'Cá'
    if class_slug.startswith('bo-'):
        return 'Bò'
    if class_slug.startswith('ga-'):
        return 'Gà'
    if class_slug.startswith('oc-'):
        return 'Ốc'
    return CLASS_DISPLAY_NAMES.get(class_slug, class_slug)
