import { Env } from '../index';
import { KnowledgeGraphData, GraphNode, GraphRelationship } from '../models/graph.models';

declare function btoa(str: string): string;

/**
 * A generic Neo4j REST API query runner.
 * @param env The environment object with credentials.
 * @param query The Cypher query to execute.
 * @param params The parameters for the Cypher query.
 * @returns The raw response from the Neo4j REST API.
 */
async function runNeo4jQuery(env: Env, query: string, params: object): Promise<any> {
  const dbIdMatch = env.NEO4J_URI.match(/neo4j\+s:\/\/([a-zA-Z0-9]+)\.databases\.neo4j\.io/);
  if (!dbIdMatch || !dbIdMatch[1]) {
    throw new Error('Could not parse Database ID from NEO4J_URI.');
  }
  const dbId = dbIdMatch[1];
  const queryApiUrl = `https://${dbId}.databases.neo4j.io/db/neo4j/query/v2`;

  const credentials = `${env.NEO4J_USERNAME}:${env.NEO4J_PASSWORD}`;
  const encodedCredentials = btoa(credentials);

  const response = await fetch(queryApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${encodedCredentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ statement: query, parameters: params }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Neo4j REST API query failed with status ${response.status}:`, errorBody);
    throw new Error(`Neo4j REST API query failed.`);
  }

  const result = await response.json<any>();

  if (result.errors && result.errors.length > 0) {
    console.error('Neo4j query returned errors:', result.errors);
    throw new Error('Neo4j query failed with errors.');
  }

  return result;
}

/**
 * Fetches the knowledge graph data for a specific page from Neo4j.
 * This implementation uses the Neo4j Transactional Cypher HTTP API with Basic Auth.
 */
/**
 * Fetches the knowledge graph data for a specific page from Neo4j.
 * This implementation uses the Neo4j Transactional Cypher HTTP API with Basic Auth.
 */
export async function getGraphDataForPage(env: Env, pageNumber: number): Promise<KnowledgeGraphData | null> {
  try {
    const cypherQuery = `
      MATCH (n)-[r:MENTIONED_ON_PAGE]->(p:Page {number: $pageNumber})
      WITH p, collect(DISTINCT n) as neighbors, collect(DISTINCT r) as rels
      // Format the page node itself
      WITH p { .*, type: labels(p)[0], id: 'page_' + p.number, name: 'page_' + p.number } as pageNode,
           neighbors,
           rels
      // Format neighbor nodes
      WITH pageNode,
           [node IN neighbors | node { .*, type: labels(node)[0] }] as neighborNodes,
           rels
      // Format relationships
      WITH pageNode,
           neighborNodes,
           [rel IN rels | { source: startNode(rel).id, target: pageNode.id, type: type(rel) }] as relationships
      RETURN pageNode, neighborNodes, relationships
    `;

    console.log(`Executing Neo4j query for page ${pageNumber}...`);
    const result = await runNeo4jQuery(env, cypherQuery, { pageNumber });

    if (!result.data || !result.data.values || result.data.values.length === 0) {
      console.log(`Neo4j query for page ${pageNumber} returned 0 results.`);
      return null;
    }

    const row = result.data.values[0];
    const pageNode: GraphNode = row[0];
    const neighborNodes: GraphNode[] = row[1];
    const relationships: GraphRelationship[] = row[2];

    if (!pageNode) {
      console.log(`No page node found for page ${pageNumber}.`);
      return null;
    }

    const allNodes = [pageNode, ...neighborNodes];

    console.log(`Neo4j query for page ${pageNumber} returned ${allNodes.length} nodes and ${relationships.length} relationships.`);

    return { nodes: allNodes, relationships };

  } catch (error) {
    console.error(`Neo4j Error fetching graph for page ${pageNumber}:`, error);
    throw new Error('Failed to fetch graph data from Neo4j.');
  }
}

/**
 * Fetches all 1-degree related nodes and relationships for a given starting node UUID.
 * It returns a flattened graph structure consistent with the companion-data endpoint.
 * This function correctly handles relationships to both Concept and Page nodes.
 */
export async function getRelatedNodes(env: Env, uuid: string): Promise<KnowledgeGraphData | null> {
  try {
    const cypherQuery = `
      MATCH (startNode {id: $uuid})
      OPTIONAL MATCH (startNode)-[r]-(neighborNode)
      WITH startNode, collect(r) as rels, collect(DISTINCT neighborNode) as neighbors
      RETURN
        // The starting node is always a concept node, so its structure is consistent.
        startNode { .*, type: labels(startNode)[0] } as startNodeData,
        // Format relationships, handling Page nodes specifically for the target ID.
        [rel in rels WHERE rel IS NOT NULL | {
          source: startNode(rel).id,
          target: CASE WHEN 'Page' IN labels(endNode(rel))
                  THEN 'page_' + endNode(rel).number
                  ELSE endNode(rel).id
                  END,
          type: type(rel)
        }] as relationshipsData,
        // Format neighbor nodes, handling Page nodes specifically to create a virtual ID.
        [node in neighbors WHERE node IS NOT NULL | 
          CASE WHEN 'Page' IN labels(node) 
          THEN node { .*, type: 'Page', id: 'page_' + node.number, name: 'page_' + node.number }
          ELSE node { .*, type: labels(node)[0] }
          END
        ] as neighborNodesData
    `;

    console.log(`Executing Neo4j REST API query for related nodes of ${uuid}...`);
    const result = await runNeo4jQuery(env, cypherQuery, { uuid });

    if (!result.data || !result.data.values || result.data.values.length === 0 || !result.data.values[0][0]) {
      console.log(`Neo4j query for related nodes of ${uuid} returned 0 results. The node might not exist.`);
      return null;
    }

    const row = result.data.values[0];
    const startNodeData: GraphNode = row[0];
    const relationshipsData: GraphRelationship[] = row[1];
    const neighborNodesData: GraphNode[] = row[2];

    const allNodes = new Map<string, GraphNode>();
    allNodes.set(startNodeData.id, startNodeData);
    neighborNodesData.forEach((node) => {
      if(node) allNodes.set(node.id, node);
    });

    return {
      nodes: Array.from(allNodes.values()),
      relationships: relationshipsData,
    };

  } catch (error) {
    console.error(`Neo4j Error fetching related nodes for ${uuid}:`, error);
    throw new Error('Failed to fetch related nodes data from Neo4j.');
  }
}

/**
 * Deletes a node and all its relationships by its UUID.
 * @param env The environment object with credentials.
 * @param uuid The UUID of the node to delete.
 * @returns A boolean indicating whether a node was deleted.
 */
export async function deleteNodeAndRelationships(env: Env, uuid: string): Promise<boolean> {
  try {
    // This query is more robust. It attempts to delete the node and then explicitly returns the count
    // of nodes that were matched and deleted. This avoids parsing the summary stats.
    const cypherQuery = `
      MATCH (n {id: $uuid})
      DETACH DELETE n
      RETURN count(n) as deletedCount
    `;

    console.log(`Executing Neo4j REST API query to delete node ${uuid}...`);
    const result = await runNeo4jQuery(env, cypherQuery, { uuid });

    // Check the data returned by the query.
    const deletedCount = result?.data?.values?.[0]?.[0] || 0;

    console.log(`Query for deleting node ${uuid} completed. Matched and deleted count: ${deletedCount}`);

    return deletedCount > 0;

  } catch (error) {
    console.error(`Neo4j Error deleting node ${uuid}:`, error);
    throw new Error('Failed to delete node from Neo4j.');
  }
}
