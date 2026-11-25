"""Restore the Velvet Room window light from the original Unity mesh, material and bursts."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from UnityPy.export.ShaderConverter import ShaderProgram
from UnityPy.helpers import CompressionHelper
from UnityPy.helpers.MeshHelper import MeshHandler
from UnityPy.streams import EndianBinaryReader

from client_bundles import load

BUNDLES = {
    'bg_p3r_1': 'b1b8d42de24606724c74e4f531a60258',
    'shaders': '3cfbf32a6575fc0c5dd7d53204f2f30d',
}


def objects(directory, bundle):
    raw = (directory / f'{bundle}.ab').read_bytes()
    if hashlib.md5(raw).hexdigest() != BUNDLES[bundle]:
        raise ValueError(f'Bundle checksum mismatch for {bundle}')
    return {obj.path_id: obj for obj in load(raw).objects}


def web_shader(reader, keywords):
    shader = reader.read()
    form = reader.read_typetree()['m_ParsedForm']
    pass_data = form['m_SubShaders'][0]['m_Passes'][0]
    state = pass_data['m_State']['rtBlend0']
    platform = shader.platforms.index(9)  # OpenGL ES 3

    def entry(values):
        value = values[platform]
        return value[0] if isinstance(value, list) else value

    offset, size = entry(shader.offsets), entry(shader.compressedLengths)
    code = CompressionHelper.decompress_lz4(bytes(shader.compressedBlob)[offset:offset+size],
                                           entry(shader.decompressedLengths))
    programs = ShaderProgram(EndianBinaryReader(code, endian='<'), reader.version).m_SubPrograms
    vertex_program = pass_data['progVertex']
    entries = vertex_program.get('m_SubPrograms') or vertex_program['m_PlayerSubPrograms'][0]
    code = next(programs[e['m_BlobIndex']].m_ProgramCode.decode()
                for e in entries if e['m_GpuProgramType'] == 4
                and programs[e['m_BlobIndex']].m_Keywords == keywords)
    vertex, fragment = code.split('#ifdef FRAGMENT\n', 1)
    vertex = vertex.split('#ifdef VERTEX\n', 1)[1].rsplit('#endif', 1)[0]
    fragment = fragment.rsplit('#endif', 1)[0]
    # Unity packs the emitter's Custom1.xy into TEXCOORD0.zw. This scene draws
    # one baked mesh per burst, so pass the same value as a loose uniform.
    vertex = vertex.replace('in mediump vec4 in_TEXCOORD0;', '''
in mediump vec2 in_TEXCOORD0;
uniform mediump vec2 arkMainUVOffset;''').replace('in_TEXCOORD0.zw', 'arkMainUVOffset')
    # All other custom coordinates are constant zero in this emitter.
    vertex = vertex.replace('in mediump vec4 in_TEXCOORD1;', 'const vec4 in_TEXCOORD1 = vec4(0.0);')
    vertex = vertex.replace('in mediump vec2 in_TEXCOORD2;', 'const vec2 in_TEXCOORD2 = vec2(0.0);')
    parts = [src.strip().replace('#define UNITY_SUPPORTS_UNIFORM_LOCATION 1',
                                 '#define UNITY_SUPPORTS_UNIFORM_LOCATION 0') for src in (vertex, fragment)]
    properties = form['m_PropInfo']['m_Props']
    return {
        'name': form['m_Name'], 'vertex': parts[0], 'fragment': parts[1],
        'defaults': {p['m_Name']: [p.get(f'm_DefValue[{i}]', 0) for i in range(4)] for p in properties},
        'samplers': {p['m_Name']: p['m_DefTexture']['m_DefaultName'] for p in properties if p['m_Type'] == 4},
        'blend': [state['srcBlend'], state['destBlend']],
    }


def export(directory, destination):
    room = objects(directory, 'bg_p3r_1')
    root = next(o.read_typetree() for o in room.values()
                if o.type.name == 'GameObject' and o.peek_name() == 'flow_1')
    parts = {obj.type.name: obj.read_typetree() for row in root['m_Component']
             if (obj := room[row['component']['m_PathID']]).type.name in
             ('Transform', 'ParticleSystem', 'ParticleSystemRenderer')}
    transform, particle, renderer = (parts[key] for key in
                                     ('Transform', 'ParticleSystem', 'ParticleSystemRenderer'))
    material = room[renderer['m_Materials'][0]['m_PathID']].read_typetree()
    shader = web_shader(objects(directory, 'shaders')[material['m_Shader']['m_PathID']],
                        material['m_ValidKeywords'])
    saved = material['m_SavedProperties']
    values = dict(saved['m_Floats'])
    values.update({name: [color[c] for c in 'rgba'] for name, color in saved['m_Colors']})
    texture = None
    for name, tex in saved['m_TexEnvs']:
        values[name+'_ST'] = [tex['m_Scale']['x'], tex['m_Scale']['y'], tex['m_Offset']['x'], tex['m_Offset']['y']]
        if name == '_MainTex':
            texture = room[tex['m_Texture']['m_PathID']].read()
    texture_name = f'{texture.m_Name}.webp'
    texture.image.save(destination.parent / texture_name, 'WEBP', lossless=True)

    mesh = MeshHandler(room[renderer['m_Mesh']['m_PathID']].read())
    mesh.process()
    vertices = [round(coord, 8) for i in mesh.m_IndexBuffer
                for coord in (*mesh.m_Vertices[i], *mesh.m_UV0[i][:2])]
    scene = json.loads(destination.read_text())
    # The light belongs between the room and its grille shadows.
    if scene['nodes'][1]['name'] == 'flow_1':
        del scene['nodes'][1]
        scene['shaders'].pop()
        scene['textures'].pop()
        scene['materials'].pop()
        scene['curves'] = [{**curve, 'node': curve['node']-1}
                           for curve in scene['curves'] if curve['node'] != 1]
    assert [node['name'] for node in scene['nodes']] == ['bg_p3r_1', 'shadow_1', 'shadow_2']
    size = particle['InitialModule']['startSize']['scalar']
    node = deepcopy(scene['nodes'][0])
    node.update(name='flow_1', mesh=vertices,
                localPosition=[transform['m_LocalPosition'][c] for c in 'xyz'],
                rotation=[transform['m_LocalRotation'][c] for c in 'xyzw'],
                scale=[size * transform['m_LocalScale'][c] for c in 'xyz'],
                uniforms={'arkMainUVOffset': [0, 0]})
    node['image'].update(texture=len(scene['textures']), material=len(scene['materials']))
    scene['nodes'].insert(1, node)
    scene['materials'].append({'name': material['m_Name'], 'shader': len(scene['shaders']),
                               'values': values, 'textures': {}})
    scene['shaders'].append(shader)
    scene['textures'].append({'file': texture_name, 'width': texture.m_Width, 'height': texture.m_Height,
                              'wrapU': texture.m_TextureSettings.m_WrapU, 'wrapV': texture.m_TextureSettings.m_WrapV})
    for curve in scene['curves']:
        curve['node'] += 1

    period = particle['lengthInSec']
    lifetime = particle['InitialModule']['startLifetime']['scalar']
    bursts = [burst['time'] for burst in particle['EmissionModule']['m_Bursts']]
    stream = particle['CustomDataModule']['vector0_0']
    offset, alpha = [], []
    for cycle in range(int(scene['duration']/period)):
        start = cycle * period
        for burst in bursts:
            time = start + burst
            alpha.append([time, 1, None, None, 0, 0, 0])
            keys = stream['maxCurve']['m_Curve']
            # Unity holds the first curve value until the first authored key.
            offset.append([time, keys[0]['value']*stream['scalar'], None, None, 0, 0, 0])
            for key in keys:
                offset.append([time + key['time']*lifetime, key['value']*stream['scalar'],
                               key['inSlope']*stream['scalar']/lifetime, key['outSlope']*stream['scalar']/lifetime,
                               key['weightedMode'], key['inWeight'], key['outWeight']])
        alpha.append([start + bursts[-1] + lifetime, 0, None, None, 0, 0, 0])
    scene['curves'].extend([
        {'node': 1, 'property': 'alpha', 'keys': alpha},
        {'node': 1, 'property': 'uniforms.arkMainUVOffset.0', 'keys': offset},
    ])
    scene['windowLightSources'] = BUNDLES
    destination.write_text(json.dumps(scene, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundles', type=Path)
    parser.add_argument('--scene', type=Path, default=Path('public/event-preview/bg_p3r_1/scene.json'))
    args = parser.parse_args()
    export(args.bundles, args.scene)
