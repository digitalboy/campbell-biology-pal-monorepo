import neo4j, { Driver, Node } from 'neo4j-driver';
import { Env } from '../index';

/**
 * Represents a relationship object as returned directly from the Neo4j query.
 * The 'type' can be null because of the OPTIONAL MATCH.
 */
interface RelationshipFromDB {
  source: string;
  target: string;
  type: string | null;
}

/**
 * Represents a clean relationship object with a guaranteed non-null type.
 */
interface Relationship extends Omit<RelationshipFromDB, 'type'> {
  type: string;
}

/**
 * Represents the final, clean graph data structure returned by the service.
 */
interface GraphData {
  nodes: Record<string, any>[];
  relationships: Relationship[];
}

let driver: Driver | null = null;

async function getDriver(env: Env): Promise<Driver> {
  // Reuse the driver instance if it has been created.
  if (!driver) {
    try {
      if (!env.NEO4J_URI || !env.NEO4J_USERNAME || !env.NEO4J_PASSWORD) {
        throw new Error('Neo4j environment variables (SECRETS) are not configured.');
      }
      console.log('Creating new Neo4j driver instance...');
      driver = neo4j.driver(
        env.NEO4J_URI,
        neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD)
      );
      console.log('Verifying Neo4j connectivity...');
      // Verify connectivity to fail early if credentials or URI are incorrect.
      await driver.verifyConnectivity();
      console.log('Neo4j connectivity verified successfully.');
    } catch (error) {
      // Log the detailed error and invalidate the driver instance.
      console.error('Failed to create or verify Neo4j driver:', error);
      driver = null; // Ensure we don't reuse a failed driver instance.
      throw error; // Re-throw the error to be caught by the calling function
    }
  }
  return driver;
}

/**
 * Fetches the knowledge graph data for a specific page from Neo4j.
 * If no data is found for the page, it returns null instead of throwing an error.
 *
 * @param env - The environment variables.
 * @param pageNumber - The page number to fetch graph data for.
 * @returns A promise that resolves to the graph data object or null.
 */
export async function getGraphDataForPage(env: Env, pageNumber: number): Promise<GraphData | null> {
  let driver: Driver;
  try {
    driver = await getDriver(env);
  } catch (error) {
    // If driver creation/verification fails, we cannot proceed.
    // The detailed error is already logged by getDriver.
    throw new Error('Failed to establish connection with Neo4j.');
  }
  const session = driver.session();
  try {
    // This query is designed to fetch a subgraph for a given page.
    // It first finds all KnowledgePoints mentioned on the page,
    // then finds all relationships that exist *between* those points.
    const cypherQuery = `
      // 1. Find all KnowledgePoints (k) on the given page and collect them
      MATCH (p:Page {number: $pageNumber})<-[:MENTIONED_ON_PAGE]-(k:KnowledgePoint)
      WITH collect(k) as nodes
      // 2. Unwind the collection to use for matching relationships
      UNWIND nodes as n1
      // 3. Find relationships between any two nodes in our collection
      OPTIONAL MATCH (n1)-[r]-(n2)
      // Ensures n2 is also on the page and avoids duplicate relationships (and self-loops)
      WHERE n2 IN nodes AND id(n1) < id(n2)
      // 4. Return the distinct nodes and a structured map for relationships
      RETURN
          nodes, // Return the original collection of nodes
          collect(DISTINCT {
              source: n1.id,
              target: n2.id,
              type: type(r)
          }) as relationships
    `;
    const params = { pageNumber };

    // Log the query for debugging purposes during local development
    console.log(`Executing Neo4j query for page ${pageNumber}:`, cypherQuery.trim());
    const result = await session.run(cypherQuery, params);

    // The query returns one record with 'nodes' and 'relationships' fields.
    if (result.records.length === 0 || result.records[0].get('nodes').length === 0) {
      console.log(`Neo4j query for page ${pageNumber} returned 0 nodes.`);
      return null;
    }

    const record = result.records[0];
    const nodes: Record<string, any>[] = record.get('nodes').map((node: Node) => node.properties);

    // Filter out potential null relationships and use a type guard to inform TypeScript of the narrowed type.
    const relationships: Relationship[] = record
      .get('relationships')
      .filter((r: RelationshipFromDB): r is Relationship => r.type !== null);

    console.log(`Neo4j query for page ${pageNumber} returned ${nodes.length} nodes and ${relationships.length} relationships.`);

    const graphData: GraphData = {
      nodes,
      relationships,
    };

    return graphData;
  } catch (error) {
    console.error(`Neo4j Error fetching graph for page ${pageNumber}:`, error);
    // In case of a real database error, we re-throw it to be caught by the handler.
    throw new Error('Failed to fetch graph data from Neo4j.');
  } finally {
    await session.close();
  }
}