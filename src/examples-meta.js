// Presentation data for the example gallery and the in-app glossary. Plain language only.
// Example ids match exampleSystems() in poc/src/starter.js; 'checkout' is exampleBuild().

export const EXAMPLE_META = {
  'url-shortener': {
    level: 'Starter',
    concepts: ['Read-heavy traffic', 'Async analytics', 'Sharding'],
    tries: [
      { mode: 'simulate', text: 'Look at the Redirect rush result: links-db is overloaded and the click consumer falls hours behind.' },
      { mode: 'deploy', text: 'Select links-db and set Shards to 4, then go back to Simulate. Failures should drop sharply.' },
      { mode: 'simulate', text: 'Press Compare designs to see the scaled multi-region design run the same traffic, and what it costs.' },
      { mode: 'simulate', text: 'Move most traffic to East & Southeast Asia under "Where requests come from". p99 climbs from distance alone.' },
      { mode: 'simulate', text: 'Under Experiments, pick "Lose one zone in us-east-1" and compare. Then give links-db 2 zones in Deploy and try again.' }
    ]
  },
  'social-network': {
    level: 'Starter',
    concepts: ['Fan-out on write', 'Feed cache', 'Backlog'],
    tries: [
      { mode: 'simulate', text: 'Run Morning timeline traffic. Timelines are one cheap read from the feed cache.' },
      { mode: 'simulate', text: 'Switch to Viral post spike. Each post is copied to every follower\'s feed, so watch FeedWorker under "Work that happens later".' },
      { mode: 'build', text: 'Open FeedWorker and change many 100 to many 2000 to model a celebrity. Run the spike again.' },
      { mode: 'simulate', text: 'Press Compare designs to see what read copies and shards buy you.' }
    ]
  },
  'streaming-service': {
    level: 'Intermediate',
    concepts: ['Object storage', 'Read copies', 'Batch jobs'],
    tries: [
      { mode: 'simulate', text: 'Run Friday night viewing and see what fills first when everyone browses at once.' },
      { mode: 'simulate', text: 'Switch the scenario to New release transcode to see how long the batch job takes and what limits it.' },
      { mode: 'build', text: 'Open Transcoder and raise parallel 10 to parallel 50. Run the transcode again.' },
      { mode: 'simulate', text: 'Under Experiments, pick "Lose us-east-1" and press Play it to watch the outage hit halfway through.' }
    ]
  },
  'search-engine': {
    level: 'Intermediate',
    concepts: ['Shard fan-out', 'Indexing pipeline', 'Batch crawl'],
    tries: [
      { mode: 'simulate', text: 'Run Popular search queries. Each query reads 20 index segments and 10 documents.' },
      { mode: 'deploy', text: 'Give search-index 8 shards. Reads by term now fan out to every shard: watch p99 versus capacity.' },
      { mode: 'simulate', text: 'Switch to Crawl and re-index, then raise parallel 20 in Crawler and compare finish times.' },
      { mode: 'simulate', text: 'Press Compare designs to see the sharded, multi-region index side by side.' }
    ]
  },
  'product-catalog': {
    level: 'Intermediate',
    concepts: ['Read cache', 'Hit ratio', 'Cold start'],
    tries: [
      { mode: 'simulate', text: 'Run Holiday browsing on the starter: catalog-db is several times over capacity, and almost every request fails.' },
      { mode: 'deploy', text: 'Select catalog-db, tick "Cache in front for reads" and leave it at 90%. Go back to Simulate and run again.' },
      { mode: 'simulate', text: 'In the playground, lower the cache hit ratio to 60%, then 80%. Find where the database starts to fail.' },
      { mode: 'simulate', text: 'Under Experiments, pick "Start with empty caches" and press Play it. Watch the database while the cache fills back up.' }
    ]
  },
  'ticket-sale': {
    level: 'Intermediate',
    concepts: ['Hot keys', 'Retries', 'Async payments'],
    tries: [
      { mode: 'simulate', text: 'Press Compare designs. Even the scaled design fails: 70% of the traffic hits one event\'s inventory, and one key lives on one partition.' },
      { mode: 'simulate', text: 'Under Hot keys, lower Inventory to 10% and run again. Same traffic, spread out, and it fits.' },
      { mode: 'simulate', text: 'Set Retries to 3 in the playground and run the starter again. Every failed try comes back as more load.' },
      { mode: 'simulate', text: 'Switch to Fans refreshing the page. Reads of a hot key can be cached: put a cache in front of the inventory store in Deploy.' }
    ]
  },
  'food-delivery': {
    level: 'Intermediate',
    concepts: ['Hot lookups', 'Queues absorb spikes', 'Multi-region writes'],
    tries: [
      { mode: 'simulate', text: 'Run Dinner rush. Restaurant lookups by city dominate the load.' },
      { mode: 'simulate', text: 'Switch to Order and dispatch surge. Orders queue up for Dispatch instead of failing.' },
      { mode: 'deploy', text: 'Select marketplace-db and add read copies in more regions, then rerun the dinner rush.' },
      { mode: 'simulate', text: 'Press Compare designs to see the partitioned, multi-region marketplace.' }
    ]
  },
  checkout: {
    level: 'Advanced',
    concepts: ['Service calls', 'Payments', 'Events and batch jobs'],
    tries: [
      { mode: 'build', text: 'Pick Checkout under "Step through an entry point" and step through it. Answer the branch questions yourself.' },
      { mode: 'simulate', text: 'Run Checkout rush and read what to try next.' },
      { mode: 'simulate', text: 'Switch to Product feed import to see a batch job\'s finish time and limiting factor.' },
      { mode: 'simulate', text: 'Press Compare designs to run the same rush on the global, multi-region design.' },
      { mode: 'simulate', text: 'Under Experiments, slow down PaymentGateway and compare. Every checkout waits for it.' }
    ]
  }
};

export const LEVEL_ORDER = { Starter: 0, Intermediate: 1, Advanced: 2 };

// Short definitions shown on hover or focus next to the terms they explain.
export const GLOSSARY = {
  p50: 'The median: half of the requests that finished were faster than this.',
  p99: 'The slowest 1% of requests that finished took at least this long. Users notice p99, not the average.',
  failures: 'Requests rejected or dropped because something was over capacity, out of connections, or timed out.',
  cost: 'An hourly estimate from sample list prices, for comparing designs, not a quote.',
  shards: 'Splitting one data set across several independent databases by a key. Each shard holds part of the rows and takes part of the load. Lookups by a different field have to ask every shard.',
  partitions: 'Separate ordered lanes in a stream. One consumer reads each lane, so partitions cap how fast messages can be handled.',
  replication: 'Keeping copies of the data in more than one region. Copies make reads closer and survive a region loss, but writes have to reach them.',
  readFrom: 'Nearest copy keeps reads local but may return slightly old data. Primary only is always current but every read travels to the primary region.',
  loadShape: 'Steady keeps the rate flat. Peak burst triples it at the busiest moment. Ramp grows past capacity to find the breaking point.',
  minMax: 'Autoscaling keeps at least the minimum instances running and never goes past the maximum. Scaling up takes time, so sudden spikes hit before new instances are ready.',
  concurrency: 'How many requests functions can handle at the same moment in this region. Past this, requests are throttled.',
  cache: 'A fast in-memory copy of recently read rows in front of a database. Reads it can answer never reach the database.',
  hitRatio: 'The share of reads the cache answers. Popular data gets high hit ratios; an empty (cold) cache answers none until it fills.',
  hotKey: 'One key (a celebrity, a big sale, a viral link) that gets a large share of all traffic. It lives on one shard, so adding shards does not spread it.',
  timeout: 'How long a request waits for one call or data operation before giving up on that try. 0 means wait as long as it takes.',
  retries: 'How many more times to try after a failure or timeout. Retries hide brief blips, but on an overloaded system every retry is more load.',
  zonesCompute: 'Zones are separate data centers inside a region. Spreading machines across zones means losing one zone takes away only part of the capacity.',
  zonesStore: 'One zone is cheapest, but losing that zone takes the database down. Two or more zones keep a standby that takes over, for about twice the cost.',
  zonesManaged: 'The provider spreads this across zones for you, so losing one zone does not stop it.',
  goal: 'The p99 latency you want. Runs that fail more than 1% of requests miss the goal even if they are fast.'
};

export const REPL_NOTES = {
  single: 'All data lives in one region. Simple and consistent, but far users pay the distance and a region loss takes it down.',
  'read-replicas': 'One region takes writes; other regions hold read-only copies. Reads get closer, writes still travel to the primary.',
  'multi-primary': 'Every region accepts writes and they sync later. Fast everywhere, but two regions can change the same row at once.',
  consensus: 'Writes wait for a majority of regions to agree. Always consistent and survives a region loss, but every write pays a cross-region round trip.',
  crr: 'Objects are copied to other regions after they are written, so far users read them locally.'
};
