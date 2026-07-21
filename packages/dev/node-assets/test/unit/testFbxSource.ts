/**
 * Creates a deterministic repository-owned ASCII FBX 7.4 triangle.
 *
 * The fixture is hand-authored from the ASCII FBX grammar exercised by Babylon.js loader tests. It
 * contains no Autodesk SDK output or third-party asset content.
 * @returns The UTF-8 encoded `.fbx` source bytes.
 */
export function CreateAsciiFbx74TriangleFixture(): Uint8Array {
    return new TextEncoder().encode(
        [
            "; FBX 7.4.0 project file",
            "GlobalSettings: {",
            "    Version: 1000",
            "    Properties70: {",
            '        P: "UpAxis", "int", "Integer", "",1',
            '        P: "UpAxisSign", "int", "Integer", "",1',
            '        P: "FrontAxis", "int", "Integer", "",2',
            '        P: "FrontAxisSign", "int", "Integer", "",1',
            '        P: "CoordAxis", "int", "Integer", "",0',
            '        P: "CoordAxisSign", "int", "Integer", "",1',
            '        P: "UnitScaleFactor", "double", "Number", "",1',
            "    }",
            "}",
            "Objects: {",
            '    Geometry: 1, "Geometry::Triangle", "Mesh" {',
            "        Vertices: *9 {",
            "            a: 0,0,0,1,0,0,0,1,0",
            "        }",
            "        PolygonVertexIndex: *3 {",
            "            a: 0,1,-3",
            "        }",
            "        LayerElementNormal: 0 {",
            '            MappingInformationType: "ByControlPoint"',
            '            ReferenceInformationType: "Direct"',
            "            Normals: *9 {",
            "                a: 0,0,1,0,0,1,0,0,1",
            "            }",
            "        }",
            "    }",
            '    Model: 2, "Model::Triangle", "Mesh" {',
            "    }",
            "}",
            "Connections: {",
            '    C: "OO", 1, 2',
            '    C: "OO", 2, 0',
            "}",
        ].join("\n")
    );
}

type BinaryFBXProperty =
    | { readonly kind: "string"; readonly value: string }
    | { readonly kind: "int32"; readonly value: number }
    | { readonly kind: "int64"; readonly value: number }
    | { readonly kind: "float64Array"; readonly value: readonly number[] }
    | { readonly kind: "int32Array"; readonly value: readonly number[] };

interface IBinaryFBXNode {
    readonly name: string;
    readonly properties?: readonly BinaryFBXProperty[];
    readonly children?: readonly IBinaryFBXNode[];
}

function ConcatBytes(chunks: readonly Uint8Array[]): Uint8Array {
    const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function WriteUint32(bytes: Uint8Array, offset: number, value: number): void {
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function WriteUint64(bytes: Uint8Array, offset: number, value: number): void {
    WriteUint32(bytes, offset, value >>> 0);
    WriteUint32(bytes, offset + 4, Math.floor(value / 0x100000000));
}

function EncodeBinaryProperty(property: BinaryFBXProperty): Uint8Array {
    if (property.kind === "string") {
        const value = new TextEncoder().encode(property.value);
        const result = new Uint8Array(5 + value.byteLength);
        result[0] = "S".charCodeAt(0);
        WriteUint32(result, 1, value.byteLength);
        result.set(value, 5);
        return result;
    }
    if (property.kind === "int32") {
        const result = new Uint8Array(5);
        result[0] = "I".charCodeAt(0);
        new DataView(result.buffer).setInt32(1, property.value, true);
        return result;
    }
    if (property.kind === "int64") {
        const result = new Uint8Array(9);
        result[0] = "L".charCodeAt(0);
        WriteUint64(result, 1, property.value);
        return result;
    }

    const elementSize = property.kind === "float64Array" ? 8 : 4;
    const result = new Uint8Array(13 + property.value.length * elementSize);
    result[0] = (property.kind === "float64Array" ? "d" : "i").charCodeAt(0);
    WriteUint32(result, 1, property.value.length);
    WriteUint32(result, 5, 0);
    WriteUint32(result, 9, property.value.length * elementSize);
    const view = new DataView(result.buffer);
    property.value.forEach((value, index) => {
        if (property.kind === "float64Array") {
            view.setFloat64(13 + index * elementSize, value, true);
        } else {
            view.setInt32(13 + index * elementSize, value, true);
        }
    });
    return result;
}

function EncodeBinaryNode(node: IBinaryFBXNode, startOffset: number, version: number): Uint8Array {
    const headerSize = version >= 7500 ? 25 : 13;
    const name = new TextEncoder().encode(node.name);
    const properties = (node.properties ?? []).map(EncodeBinaryProperty);
    const propertyBytes = ConcatBytes(properties);
    const children: Uint8Array[] = [];
    let cursor = startOffset + headerSize + name.byteLength + propertyBytes.byteLength;
    for (const child of node.children ?? []) {
        const childBytes = EncodeBinaryNode(child, cursor, version);
        children.push(childBytes);
        cursor += childBytes.byteLength;
    }
    const sentinel = children.length > 0 ? new Uint8Array(headerSize) : new Uint8Array();
    const endOffset = cursor + sentinel.byteLength;
    const header = new Uint8Array(headerSize);
    if (version >= 7500) {
        WriteUint64(header, 0, endOffset);
        WriteUint64(header, 8, properties.length);
        WriteUint64(header, 16, propertyBytes.byteLength);
    } else {
        WriteUint32(header, 0, endOffset);
        WriteUint32(header, 4, properties.length);
        WriteUint32(header, 8, propertyBytes.byteLength);
    }
    header[headerSize - 1] = name.byteLength;
    return ConcatBytes([header, name, propertyBytes, ...children, sentinel]);
}

function CreateBinaryFbxTriangleFixture(version: 7400 | 7500): Uint8Array {
    const stringProperty = (value: string): BinaryFBXProperty => ({ kind: "string", value });
    const int32Property = (value: number): BinaryFBXProperty => ({ kind: "int32", value });
    const int64Property = (value: number): BinaryFBXProperty => ({ kind: "int64", value });
    const nodes: readonly IBinaryFBXNode[] = [
        {
            name: "GlobalSettings",
            children: [
                { name: "Version", properties: [int32Property(1000)] },
                {
                    name: "Properties70",
                    children: [
                        { name: "P", properties: [stringProperty("UpAxis"), stringProperty("int"), stringProperty("Integer"), stringProperty(""), int32Property(1)] },
                        { name: "P", properties: [stringProperty("UpAxisSign"), stringProperty("int"), stringProperty("Integer"), stringProperty(""), int32Property(1)] },
                        { name: "P", properties: [stringProperty("FrontAxis"), stringProperty("int"), stringProperty("Integer"), stringProperty(""), int32Property(2)] },
                        { name: "P", properties: [stringProperty("FrontAxisSign"), stringProperty("int"), stringProperty("Integer"), stringProperty(""), int32Property(1)] },
                        { name: "P", properties: [stringProperty("CoordAxis"), stringProperty("int"), stringProperty("Integer"), stringProperty(""), int32Property(0)] },
                        { name: "P", properties: [stringProperty("CoordAxisSign"), stringProperty("int"), stringProperty("Integer"), stringProperty(""), int32Property(1)] },
                        { name: "P", properties: [stringProperty("UnitScaleFactor"), stringProperty("double"), stringProperty("Number"), stringProperty(""), int32Property(1)] },
                    ],
                },
            ],
        },
        {
            name: "Objects",
            children: [
                {
                    name: "Geometry",
                    properties: [int64Property(1), stringProperty("Geometry::Triangle"), stringProperty("Mesh")],
                    children: [
                        { name: "Vertices", properties: [{ kind: "float64Array", value: [0, 0, 0, 1, 0, 0, 0, 1, 0] }] },
                        { name: "PolygonVertexIndex", properties: [{ kind: "int32Array", value: [0, 1, -3] }] },
                        {
                            name: "LayerElementNormal",
                            properties: [int32Property(0)],
                            children: [
                                { name: "MappingInformationType", properties: [stringProperty("ByControlPoint")] },
                                { name: "ReferenceInformationType", properties: [stringProperty("Direct")] },
                                { name: "Normals", properties: [{ kind: "float64Array", value: [0, 0, 1, 0, 0, 1, 0, 0, 1] }] },
                            ],
                        },
                    ],
                },
                { name: "Model", properties: [int64Property(2), stringProperty("Model::Triangle"), stringProperty("Mesh")] },
            ],
        },
        {
            name: "Connections",
            children: [
                { name: "C", properties: [stringProperty("OO"), int64Property(1), int64Property(2)] },
                { name: "C", properties: [stringProperty("OO"), int64Property(2), int64Property(0)] },
            ],
        },
    ];

    const header = new Uint8Array(27);
    header.set(new TextEncoder().encode("Kaydara FBX Binary  \0"));
    WriteUint32(header, 23, version);
    const encodedNodes: Uint8Array[] = [];
    let offset = header.byteLength;
    for (const node of nodes) {
        const encoded = EncodeBinaryNode(node, offset, version);
        encodedNodes.push(encoded);
        offset += encoded.byteLength;
    }
    const rootSentinel = new Uint8Array(version >= 7500 ? 25 : 13);
    return ConcatBytes([header, ...encodedNodes, rootSentinel]);
}

/**
 * Creates a deterministic repository-owned binary FBX 7.4 triangle using 32-bit node headers.
 * The fixture is generated directly from the public binary FBX record layout and contains no
 * Autodesk SDK output or third-party asset content.
 * @returns The generated binary FBX bytes.
 */
export function CreateBinaryFbx74TriangleFixture(): Uint8Array {
    return CreateBinaryFbxTriangleFixture(7400);
}

/**
 * Creates a deterministic repository-owned binary FBX 7.5 triangle using 64-bit node headers.
 * The fixture is generated directly from the public binary FBX record layout and contains no
 * Autodesk SDK output or third-party asset content.
 * @returns The generated binary FBX bytes.
 */
export function CreateBinaryFbx75TriangleFixture(): Uint8Array {
    return CreateBinaryFbxTriangleFixture(7500);
}

