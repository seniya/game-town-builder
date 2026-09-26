#!/usr/bin/env python3
"""도토리 마을(v2, src/dotori)에 쓸 CC0 에셋을 골라 public/dotori/assets/ 에 모은다(최종 형식은 데이터를 품은 glTF JSON).

KayKit 팩은 .gltf + .bin + 공용 텍스처 PNG 로 나뉘어 있다. 아티팩트에 올릴 파일 수를 줄이려고
하나의 GLB(버퍼와 이미지를 모두 담은 바이너리)로 합친다. Kenney GLB 는 외부 텍스처(Textures/colormap.png)를
참조하므로 그 이미지를 GLB 안에 넣는다.

사용법: python3 tools/dotori/pack_assets.py <내려받은 팩들이 있는 폴더>
  - <폴더>/KayKit-Medieval-Hexagon-Pack-1.0   (git clone)
  - <폴더>/mini   (kenney_mini-characters.zip 압축 해제)
  - <폴더>/town   (kenney_fantasy-town-kit_2.0.zip 압축 해제)
출처와 라이선스: docs/research/2026-09-26-cc0-3d-asset-packs.md
"""
import glob
import json
import os
import shutil
import struct
import sys

KAYKIT = [
    'building_home_A_blue', 'building_home_A_red', 'building_home_A_green', 'building_home_A_yellow',
    'building_home_B_blue', 'building_home_B_red', 'building_home_B_green', 'building_home_B_yellow',
    'building_tavern_red', 'building_market_yellow', 'building_blacksmith_blue', 'building_windmill_yellow',
    'tree_single_A', 'tree_single_B',
    'rock_single_A', 'rock_single_C', 'rock_single_E', 'waterlily_A', 'waterlily_B', 'waterplant_A',
    'barrel', 'sack', 'crate_A_small', 'crate_open', 'wheelbarrow', 'bucket_water', 'resource_lumber',
    'flag_red', 'flag_yellow', 'flag_blue', 'flag_green',
    # v2 가꾸기·공사·풍경
    'building_scaffolding', 'building_lumbermill_yellow', 'building_well_blue', 'fence_wood_straight',
    'tree_single_A_cut', 'trees_A_small', 'trees_B_medium', 'pallet', 'crate_long_A',
]
KENNEY_TOWN = ['fountain-round', 'lantern', 'stall-red', 'stall-green', 'stall-bench', 'cart', 'hedge', 'stall-stool']


def pad4(b, fill=b'\x00'):
    """GLB 청크는 4 바이트 정렬이 필요하다."""
    return b + fill * ((4 - len(b) % 4) % 4)


def gltf_to_glb(src, dst):
    """외부 .bin 과 이미지를 하나의 버퍼로 합쳐 GLB 로 쓴다. 경계 상자를 돌려준다."""
    base = os.path.dirname(src)
    j = json.load(open(src))
    blob = bytearray()
    # 원래 버퍼들을 차례로 이어 붙이고 bufferView 의 오프셋을 옮긴다.
    offsets = []
    for b in j['buffers']:
        offsets.append(len(blob))
        blob += open(os.path.join(base, b['uri']), 'rb').read()
        blob = bytearray(pad4(bytes(blob)))
    for bv in j['bufferViews']:
        bv['byteOffset'] = bv.get('byteOffset', 0) + offsets[bv['buffer']]
        bv['buffer'] = 0
    # 이미지를 bufferView 로 옮긴다. 텍스처 PNG 는 팩 안 여러 폴더에 같은 파일이 있다.
    for img in j.get('images', []):
        uri = img.pop('uri')
        path = os.path.join(base, uri)
        if not os.path.exists(path):
            path = glob.glob(os.path.join(ROOT, '**', uri), recursive=True)[0]
        data = open(path, 'rb').read()
        j['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        img['bufferView'] = len(j['bufferViews']) - 1
        img['mimeType'] = 'image/png'
        blob += data
        blob = bytearray(pad4(bytes(blob)))
    j['buffers'] = [{'byteLength': len(blob)}]
    js = pad4(json.dumps(j, separators=(',', ':')).encode(), b' ')
    out = bytearray(b'glTF') + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack('<I', len(js)) + b'JSON' + js
    out += struct.pack('<I', len(blob)) + b'BIN\x00' + blob
    open(dst, 'wb').write(out)
    return bbox(j)


def bbox(j):
    """POSITION 접근자의 min/max 로 대략적인 경계 상자를 구한다(노드 변환은 무시)."""
    mn, mx = [1e9] * 3, [-1e9] * 3
    for m in j['meshes']:
        for pr in m['primitives']:
            a = j['accessors'][pr['attributes']['POSITION']]
            for i in range(3):
                mn[i] = min(mn[i], a['min'][i])
                mx[i] = max(mx[i], a['max'][i])
    return [round(v, 2) for v in mn], [round(v, 2) for v in mx]


def embed_glb_images(src, dst):
    """외부 텍스처(uri)를 참조하는 GLB 의 이미지를 BIN 청크 안으로 옮겨 한 파일로 만든다."""
    b = open(src, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    rest = b[20 + n:]
    bn = struct.unpack('<I', rest[0:4])[0]
    blob = bytearray(rest[8:8 + bn])
    for img in j.get('images', []):
        if 'uri' not in img:
            continue
        data = open(os.path.join(os.path.dirname(src), img.pop('uri')), 'rb').read()
        blob = bytearray(pad4(bytes(blob)))
        j['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        img['bufferView'] = len(j['bufferViews']) - 1
        img['mimeType'] = 'image/png'
        blob += data
    blob = bytearray(pad4(bytes(blob)))
    j['buffers'][0]['byteLength'] = len(blob)
    js = pad4(json.dumps(j, separators=(',', ':')).encode(), b' ')
    out = bytearray(b'glTF') + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack('<I', len(js)) + b'JSON' + js
    out += struct.pack('<I', len(blob)) + b'BIN\x00' + blob
    open(dst, 'wb').write(out)


def glb_to_json(path):
    """GLB 를 버퍼를 data URI 로 품은 glTF JSON(.json)으로 바꾼다.
    아티팩트는 .glb 를 서빙하지 않고 .json 은 서빙한다. GLTFLoader 는 어느 쪽이든 읽는다."""
    import base64
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    rest = b[20 + n:]
    bn = struct.unpack('<I', rest[0:4])[0]
    j['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(rest[8:8 + bn]).decode()
    out = path[:-4] + '.json'
    json.dump(j, open(out, 'w'), separators=(',', ':'))
    os.remove(path)


def glb_json(path):
    """GLB 의 JSON 청크를 읽는다."""
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n])


if __name__ == '__main__':
    ROOT = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', '..', 'public', 'dotori', 'assets')
    os.makedirs(out, exist_ok=True)
    hexroot = os.path.join(ROOT, 'KayKit-Medieval-Hexagon-Pack-1.0')
    for name in KAYKIT:
        src = glob.glob(os.path.join(hexroot, '**', 'gltf', '**', name + '.gltf'), recursive=True)[0]
        print('kaykit', name, gltf_to_glb(src, os.path.join(out, 'kk_' + name + '.glb')))
    for name in KENNEY_TOWN:
        src = os.path.join(ROOT, 'town', 'Models', 'GLB format', name + '.glb')
        embed_glb_images(src, os.path.join(out, 'kt_' + name + '.glb'))
        print('town', name, bbox(glb_json(src)))
    for src in sorted(glob.glob(os.path.join(ROOT, 'mini', 'Models', 'GLB format', 'character-*.glb'))):
        embed_glb_images(src, os.path.join(out, 'kc_' + os.path.basename(src)))
        print('char', os.path.basename(src), bbox(glb_json(src)))
    for f in glob.glob(os.path.join(out, '*.glb')):
        glb_to_json(f)
    shutil.copy(os.path.join(ROOT, 'mini', 'License.txt'), os.path.join(out, 'LICENSE-kenney-mini-characters.txt'))
    shutil.copy(os.path.join(ROOT, 'town', 'License.txt'), os.path.join(out, 'LICENSE-kenney-fantasy-town-kit.txt'))
    shutil.copy(os.path.join(hexroot, 'LICENSE.txt'), os.path.join(out, 'LICENSE-kaykit-medieval-hexagon.txt'))
