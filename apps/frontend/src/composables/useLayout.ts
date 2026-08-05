// src/composables/useLayout.ts

import dagre from 'dagre';
import type { Node, Edge } from '@vue-flow/core';

// 为 dagre 返回的节点定义一个接口
// 这有助于 TypeScript 理解从 dagre 获取的数据结构
interface DagreNode {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function useLayout(direction: 'TB' | 'LR' = 'LR') {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const layout = (nodes: Node[], edges: Edge[]): Node[] => {
        dagreGraph.setGraph({ rankdir: direction });

        nodes.forEach((node) => {
            const nodeWidth = node.width || 172;
            const nodeHeight = node.height || 36;
            dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
        });

        edges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        return nodes.map((node) => {
            // 使用类型断言 'as DagreNode' 告诉 TS 我们期望的类型
            const dagreNode = dagreGraph.node(node.id) as DagreNode | undefined;

            // 添加一个安全检查，以防 dagre 出错找不到节点
            if (!dagreNode) {
                console.warn(`Dagre layout failed for node: ${node.id}`);
                return node;
            }

            // **核心改动：将计算分解为多个清晰的步骤**
            // 这可以帮助 TypeScript 正确推断每个变量的类型
            const centerX: number = dagreNode.x;
            const centerY: number = dagreNode.y;

            // 我们使用 dagre 计算出的尺寸，这样更精确
            const nodeWidth: number = dagreNode.width;
            const nodeHeight: number = dagreNode.height;

            // 计算节点左上角的坐标
            const topLeftX = centerX - nodeWidth / 2;
            const topLeftY = centerY - nodeHeight / 2;

            return {
                ...node,
                position: {
                    x: topLeftX,
                    y: topLeftY,
                },
            };
        });
    };

    return { layout };
}