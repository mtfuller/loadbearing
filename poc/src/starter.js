/* ===================== Example Build and Deploy configs ===================== */
function exampleBuild() {
  const F = (name, type, o) => Object.assign({ name, type }, o || {});
  return {
    kind: 'loadbearing-build', v: 1, id: 'b-checkout', name: 'Checkout system',
    workloads: [
      { id: 'w1', name: 'Storefront', x: 20, y: 60, code:
`# Public API. Each "when" block is an endpoint.
when Checkout {
  call CartService.GetCart
  if CartIsEmpty @4% {
    error 400
  }
  read Customers by customer_id
  insert Checkouts
  call PaymentService.CreatePayment
  if PaymentDeclined @6% {
    update Checkouts
    error 402
  }
  update Checkouts
  publish OrderEvents
}

when ViewOrder {
  read Checkouts by checkout_id
  read Shipments by checkout_id
}` },
      { id: 'w2', name: 'CartService', x: 290, y: 20, code:
`when GetCart {
  read Carts by customer_id
  for each item in Cart ~4 {
    read Products by product_id
  }
}` },
      { id: 'w3', name: 'PaymentService', x: 290, y: 170, code:
`when CreatePayment {
  parallel {
    call FraudCheck.Score
    read Payments by checkout_id
  }
  call PaymentGateway.Charge
  insert Payments
}` },
      { id: 'w4', name: 'FraudCheck', x: 290, y: 320, code:
`when Score {
  read Customers by customer_id
  compute 12ms
}` },
      { id: 'w5', name: 'PaymentGateway', x: 290, y: 450, external: true, code:
`# Runs outside your system. Use "compute" for the
# response time you expect from the provider.
when Charge {
  compute 180ms
}` },
      { id: 'w6', name: 'Fulfillment', x: 290, y: 600, code:
`when message OrderEvents {
  read Checkouts by checkout_id
  insert Shipments
}` },
      { id: 'w7', name: 'ProductImport', x: 20, y: 400, code:
`when file ProductFeeds {
  for each row in file {
    upsert Products
  }
}` },
      { id: 'w8', name: 'NightlyReport', x: 20, y: 660, code:
`when schedule "daily 02:00" {
  read Checkouts by status many 120k
  insert Reports
}` }
    ],
    data: [
      { id: 'd1', name: 'Carts', kind: 'kv', x: 560, y: 10, rows: 2e6, rowKB: 2, fields: [F('customer_id', 'uuid', { key: true, ref: 'Customers.customer_id' }), F('items', 'json')] },
      { id: 'd2', name: 'Products', kind: 'table', x: 560, y: 120, rows: 5e5, rowKB: 1, fields: [F('product_id', 'uuid', { key: true }), F('name', 'text'), F('price', 'decimal'), F('stock', 'int')] },
      { id: 'd3', name: 'Customers', kind: 'table', x: 560, y: 300, rows: 2e7, rowKB: 0.5, fields: [F('customer_id', 'uuid', { key: true }), F('email', 'text', { index: true }), F('country', 'char(2)'), F('created_at', 'timestamp')] },
      { id: 'd4', name: 'Checkouts', kind: 'table', x: 830, y: 20, rows: 4e8, rowKB: 1.5, fields: [F('checkout_id', 'uuid', { key: true }), F('customer_id', 'uuid', { index: true, ref: 'Customers.customer_id' }), F('status', 'text'), F('total', 'decimal'), F('created_at', 'timestamp', { index: true })] },
      { id: 'd5', name: 'Payments', kind: 'table', x: 560, y: 470, rows: 4.2e8, rowKB: 0.6, fields: [F('payment_id', 'uuid', { key: true }), F('checkout_id', 'uuid', { index: true, ref: 'Checkouts.checkout_id' }), F('amount', 'decimal'), F('status', 'text')] },
      { id: 'd6', name: 'Shipments', kind: 'table', x: 830, y: 230, rows: 3.8e8, rowKB: 0.4, fields: [F('shipment_id', 'uuid', { key: true }), F('checkout_id', 'uuid', { index: true, ref: 'Checkouts.checkout_id' }), F('carrier', 'text')] },
      { id: 'd7', name: 'OrderEvents', kind: 'stream', x: 830, y: 400, rows: 0, rowKB: 0.5, partitionKey: 'customer_id', fields: [F('checkout_id', 'uuid', { ref: 'Checkouts.checkout_id' }), F('customer_id', 'uuid', { ref: 'Customers.customer_id' }), F('type', 'text')] },
      { id: 'd8', name: 'ProductFeeds', kind: 'file', x: 20, y: 520, rows: 1e6, rowKB: 0.2, fields: [F('product_id', 'uuid', { ref: 'Products.product_id' }), F('price', 'decimal'), F('stock', 'int')] },
      { id: 'd9', name: 'Reports', kind: 'blob', x: 830, y: 560, rows: 0, rowKB: 2000, fields: [F('date', 'date'), F('csv', 'file')] }
    ],
    scenarios: [
      { id: 'sc1', name: 'Checkout rush', entry: 'Storefront.Checkout', count: 360000, durationMin: 60, burst: 'steady', origins: { na: 50, eu: 30, asia: 20 }, odds: {}, goalMs: 800 },
      { id: 'sc2', name: 'Order lookups', entry: 'Storefront.ViewOrder', count: 7.2e6, durationMin: 60, burst: 'steady', origins: { na: 50, eu: 30, asia: 20 }, odds: {}, goalMs: 150 },
      { id: 'sc3', name: 'Product feed import', entry: 'ProductImport.file ProductFeeds', rows: 1e6, goalMin: 30, origins: {}, odds: {} },
      { id: 'sc4', name: 'Nightly report', entry: 'NightlyReport.schedule daily 02:00', rows: 1, goalMin: 10, origins: {}, odds: {} }
    ]
  };
}
function exampleDeploys() {
  return [
    { kind: 'loadbearing-deploy', v: 1, id: 'dp-mono', name: 'Monolith in one region', regions: ['use1'], peering: false, externals: { PaymentGateway: { region: 'use1' } },
      compute: [{ id: 'c1', name: 'app-cluster', type: 'k8s', regions: ['use1'], size: 'Medium', min: 3, max: 30, workloads: ['Storefront', 'CartService', 'PaymentService', 'FraudCheck', 'Fulfillment', 'ProductImport', 'NightlyReport'] }],
      stores: [
        { id: 's1', name: 'main-db', type: 'postgres', regions: ['use1'], primary: 'use1', repl: 'single', readFrom: 'nearest', size: 'Medium', data: ['Customers', 'Products', 'Checkouts', 'Payments', 'Shipments'] },
        { id: 's2', name: 'cart-cache', type: 'redis', regions: ['use1'], primary: 'use1', repl: 'single', readFrom: 'nearest', size: 'Small', data: ['Carts'] },
        { id: 's3', name: 'events', type: 'kafka', regions: ['use1'], primary: 'use1', repl: 'single', readFrom: 'nearest', size: 'Small', partitions: 12, data: ['OrderEvents'] },
        { id: 's4', name: 'files', type: 'objects', regions: ['use1'], primary: 'use1', repl: 'single', readFrom: 'nearest', size: 'Medium', data: ['ProductFeeds', 'Reports'] }
      ] },
    { kind: 'loadbearing-deploy', v: 1, id: 'dp-global', name: 'Global services', regions: ['use1', 'euw1', 'apse1'], peering: true, externals: { PaymentGateway: { region: 'use1' } },
      compute: [
        { id: 'c1', name: 'edge-cluster', type: 'k8s', regions: ['use1', 'euw1', 'apse1'], size: 'Medium', min: 3, max: 40, workloads: ['Storefront', 'CartService'] },
        { id: 'c2', name: 'payments-cluster', type: 'k8s', regions: ['use1'], size: 'Medium', min: 3, max: 20, workloads: ['PaymentService', 'FraudCheck'] },
        { id: 'c3', name: 'workers', type: 'fn', regions: ['use1'], concurrency: 1000, memory: 1024, vpc: true, workloads: ['Fulfillment', 'ProductImport', 'NightlyReport'] }
      ],
      stores: [
        { id: 's1', name: 'orders-db', type: 'distsql', regions: ['use1', 'euw1', 'apse1'], primary: 'use1', repl: 'consensus', readFrom: 'nearest', size: 'Medium', data: ['Checkouts', 'Shipments'] },
        { id: 's2', name: 'payments-db', type: 'postgres', regions: ['use1'], primary: 'use1', repl: 'single', readFrom: 'nearest', size: 'Medium', data: ['Payments'] },
        { id: 's3', name: 'customers-kv', type: 'kv', regions: ['use1', 'euw1', 'apse1'], primary: 'use1', repl: 'multi-primary', readFrom: 'nearest', size: 'Medium', data: ['Customers', 'Carts'] },
        { id: 's4', name: 'catalog-db', type: 'postgres', regions: ['use1', 'euw1', 'apse1'], primary: 'use1', repl: 'read-replicas', readFrom: 'nearest', size: 'Small', data: ['Products'] },
        { id: 's5', name: 'events', type: 'kafka', regions: ['use1'], primary: 'use1', repl: 'single', readFrom: 'nearest', size: 'Small', partitions: 12, data: ['OrderEvents'] },
        { id: 's6', name: 'files', type: 'objects', regions: ['use1'], primary: 'use1', repl: 'single', readFrom: 'nearest', size: 'Medium', data: ['ProductFeeds', 'Reports'] }
      ] }
  ];
}
function exampleSystems() {
  const F = (name, type, o) => Object.assign({ name, type }, o || {});
  const data = (id, name, kind, fields, rows, rowKB = 1, extra = {}) => ({
    id, name, kind, x: 500 + (id.charCodeAt(1) % 2) * 260, y: 30 + Number(id.slice(1)) * 90,
    rows, rowKB, fields, ...extra
  });
  const system = (id, name, summary, lesson, workloads, dataNodes, scenarios, storeSpecs, scaleStoreSpecs) => {
    const build = { kind: 'loadbearing-build', v: 1, id: `b-${id}`, name, workloads, data: dataNodes, scenarios };
    const makeDeploy = (suffix, deployName, regions, computeName, specs, size, min, max) => ({
      kind: 'loadbearing-deploy', v: 1, id: `dp-${id}-${suffix}`, name: deployName, regions,
      peering: regions.length > 1, externals: {},
      compute: [{ id: `c-${id}-${suffix}`, name: computeName, type: 'k8s', regions, size, min, max, workloads: workloads.filter((w) => !w.external).map((w) => w.name) }],
      stores: specs.map((spec, index) => ({
        id: `s-${id}-${suffix}-${index}`, name: spec.name, type: spec.type, regions: spec.regions || regions,
        primary: (spec.regions || regions)[0], repl: spec.repl || (regions.length > 1 ? 'read-replicas' : 'single'),
        readFrom: 'nearest', size: spec.size || size, shards: spec.shards || 1, partitions: spec.partitions || 12,
        ...(spec.cache ? { cache: spec.cache } : {}), data: spec.data
      }))
    });
    return {
      id, name, summary, lesson, build,
      deploys: [
        makeDeploy('simple', 'Single-region starter', ['use1'], 'app', storeSpecs, 'Small', 2, 8),
        makeDeploy('scaled', 'Scaled multi-region design', ['use1', 'euw1', 'apse1'], 'edge-services', scaleStoreSpecs, 'Medium', 6, 40)
      ]
    };
  };
  return [
    system('url-shortener', 'URL shortener', 'Create short links, redirect quickly, and process click analytics asynchronously.',
      'Redirects dominate writes. Compare a relational lookup with a replicated key-value store, then follow click events into the analytics queue.',
      [
        { id: 'w1', name: 'LinkAPI', x: 20, y: 80, code: 'when Create {\n  insert ShortLinks\n}\n\nwhen Redirect {\n  read ShortLinks by code\n  publish ClickEvents\n}' },
        { id: 'w2', name: 'ClickWorker', x: 300, y: 300, code: 'when message ClickEvents {\n  insert Clicks\n}' }
      ],
      [
        data('d1', 'ShortLinks', 'table', [F('code', 'text', { key: true }), F('url', 'text'), F('created_at', 'timestamp')], 2e8, 0.4),
        data('d2', 'ClickEvents', 'stream', [F('code', 'text'), F('clicked_at', 'timestamp')], 0, 0.2, { partitionKey: 'code' }),
        data('d3', 'Clicks', 'table', [F('click_id', 'uuid', { key: true }), F('code', 'text', { index: true }), F('clicked_at', 'timestamp')], 8e8, 0.2)
      ],
      [{ id: 'sc-url-redirect', name: 'Redirect rush', entry: 'LinkAPI.Redirect', count: 1.2e7, durationMin: 60, burst: 'peak', origins: { na: 45, eu: 30, asia: 25 }, odds: {}, goalMs: 100 },
        { id: 'sc-url-create', name: 'Link creation', entry: 'LinkAPI.Create', count: 120000, durationMin: 60, burst: 'steady', origins: { na: 60, eu: 25, asia: 15 }, odds: {}, goalMs: 250 }],
      [{ name: 'links-db', type: 'postgres', data: ['ShortLinks'] }, { name: 'click-stream', type: 'kafka', data: ['ClickEvents'] }, { name: 'analytics-db', type: 'postgres', data: ['Clicks'] }],
      [{ name: 'links-kv', type: 'kv', repl: 'multi-primary', data: ['ShortLinks'] }, { name: 'click-stream', type: 'kafka', repl: 'single', regions: ['use1'], data: ['ClickEvents'] }, { name: 'analytics-db', type: 'postgres', data: ['Clicks'] }]
    ),
    system('search-engine', 'Search engine', 'Serve ranked queries while crawlers and indexers continuously update the search index.',
      'A query fans into an index and ranker. Compare a single index store with sharded partitions, and batch indexing with online traffic.',
      [
        { id: 'w1', name: 'SearchAPI', x: 20, y: 70, code: 'when Query {\n  read IndexSegments by term many 20\n  call Ranker.Score\n}' },
        { id: 'w2', name: 'Ranker', x: 300, y: 70, code: 'when Score {\n  read Documents by doc_id many 10\n  compute 8ms\n}' },
        { id: 'w3', name: 'Crawler', x: 20, y: 330, code: 'when file CrawlPages {\n  for each page in file parallel 20 {\n    upsert Documents\n    publish IndexQueue\n  }\n}' },
        { id: 'w4', name: 'Indexer', x: 300, y: 330, code: 'when message IndexQueue {\n  insert IndexSegments\n}' }
      ],
      [
        data('d1', 'Documents', 'document', [F('doc_id', 'uuid', { key: true }), F('url', 'text', { index: true }), F('body', 'text'), F('updated_at', 'timestamp')], 5e9, 8),
        data('d2', 'IndexSegments', 'table', [F('segment_id', 'uuid', { key: true }), F('term', 'text', { index: true }), F('doc_id', 'uuid', { index: true })], 2e10, 0.4),
        data('d3', 'IndexQueue', 'queue', [F('doc_id', 'uuid'), F('url', 'text')], 0, 0.3),
        data('d4', 'CrawlPages', 'file', [F('url', 'text'), F('body', 'text')], 2e6, 6)
      ],
      [{ id: 'sc-search-query', name: 'Popular search queries', entry: 'SearchAPI.Query', count: 3.6e6, durationMin: 60, burst: 'steady', origins: { na: 50, eu: 30, asia: 20 }, odds: {}, goalMs: 400 },
        { id: 'sc-search-crawl', name: 'Crawl and re-index', entry: 'Crawler.file CrawlPages', rows: 2e6, goalMin: 90, origins: {}, odds: {} }],
      [{ name: 'content-db', type: 'doc', data: ['Documents'] }, { name: 'search-index', type: 'postgres', shards: 1, data: ['IndexSegments'] }, { name: 'index-queue', type: 'queue', data: ['IndexQueue'] }, { name: 'crawl-files', type: 'objects', data: ['CrawlPages'] }],
      [{ name: 'content-db', type: 'doc', shards: 8, data: ['Documents'] }, { name: 'search-index', type: 'postgres', shards: 16, data: ['IndexSegments'] }, { name: 'index-queue', type: 'queue', repl: 'single', regions: ['use1'], data: ['IndexQueue'] }, { name: 'crawl-files', type: 'objects', repl: 'crr', data: ['CrawlPages'] }]
    ),
    system('social-network', 'Social network', 'Publish posts, follow people, and build timelines from a stream of social activity.',
      'Feed fan-out is a trade-off: work can happen at write time or read time. Change the load shape and watch the queue, writes, and timeline reads.',
      [
        { id: 'w1', name: 'SocialAPI', x: 20, y: 80, code: 'when PublishPost {\n  insert Posts\n  publish FeedEvents\n}\n\nwhen Timeline {\n  read Feeds by user_id many 30\n}\n\nwhen Follow {\n  insert Follows\n}' },
        { id: 'w2', name: 'FeedWorker', x: 300, y: 320, code: 'when message FeedEvents {\n  read Follows by followee_id many 100\n  insert Feeds\n}' }
      ],
      [
        data('d1', 'Posts', 'table', [F('post_id', 'uuid', { key: true }), F('user_id', 'uuid', { index: true }), F('body', 'text')], 2e10, 1),
        data('d2', 'Follows', 'table', [F('follow_id', 'uuid', { key: true }), F('follower_id', 'uuid', { index: true }), F('followee_id', 'uuid', { index: true })], 5e10, 0.2),
        data('d3', 'Feeds', 'kv', [F('user_id', 'uuid', { key: true }), F('post_ids', 'json')], 3e9, 2),
        data('d4', 'FeedEvents', 'stream', [F('post_id', 'uuid'), F('user_id', 'uuid')], 0, 0.3, { partitionKey: 'user_id' })
      ],
      [{ id: 'sc-social-read', name: 'Morning timeline traffic', entry: 'SocialAPI.Timeline', count: 1.8e7, durationMin: 60, burst: 'peak', origins: { na: 55, eu: 25, asia: 20 }, odds: {}, goalMs: 250 },
        { id: 'sc-social-post', name: 'Viral post spike', entry: 'SocialAPI.PublishPost', count: 1.2e6, durationMin: 15, burst: 'ramp', origins: { na: 55, eu: 25, asia: 20 }, odds: {}, goalMs: 500 }],
      [{ name: 'social-db', type: 'postgres', data: ['Posts', 'Follows'] }, { name: 'feed-cache', type: 'redis', data: ['Feeds'] }, { name: 'feed-stream', type: 'kafka', data: ['FeedEvents'] }],
      [{ name: 'social-db', type: 'postgres', shards: 8, data: ['Posts', 'Follows'] }, { name: 'feed-cache', type: 'redis', repl: 'read-replicas', data: ['Feeds'] }, { name: 'feed-stream', type: 'kafka', repl: 'single', regions: ['use1'], data: ['FeedEvents'] }]
    ),
    system('streaming-service', 'Streaming service', 'Browse a video catalog, start playback, and process uploads and viewing events.',
      'Large video bytes belong in object storage, not the catalog database. Compare regional metadata reads with a global object footprint and batch transcode work.',
      [
        { id: 'w1', name: 'PlaybackAPI', x: 20, y: 80, code: 'when Browse {\n  read Catalog by category many 20\n}\n\nwhen Play {\n  read Catalog by title_id\n  read Manifests by title_id\n  publish ViewEvents\n}' },
        { id: 'w2', name: 'Transcoder', x: 300, y: 320, code: 'when file Uploads {\n  for each video in file parallel 10 {\n    insert Manifests\n  }\n}' }
      ],
      [
        data('d1', 'Catalog', 'table', [F('title_id', 'uuid', { key: true }), F('category', 'text', { index: true }), F('name', 'text')], 2e6, 0.5),
        data('d2', 'Manifests', 'table', [F('title_id', 'uuid', { key: true }), F('manifest_url', 'text'), F('duration', 'int')], 2e6, 0.2),
        data('d3', 'VideoObjects', 'blob', [F('title_id', 'uuid'), F('rendition', 'text'), F('bytes', 'int')], 2e7, 12000),
        data('d4', 'ViewEvents', 'stream', [F('title_id', 'uuid'), F('viewer_id', 'uuid')], 0, 0.3, { partitionKey: 'title_id' }),
        data('d5', 'Uploads', 'file', [F('title_id', 'uuid'), F('bytes', 'int')], 20000, 12000)
      ],
      [{ id: 'sc-stream-browse', name: 'Friday night viewing', entry: 'PlaybackAPI.Browse', count: 1.8e7, durationMin: 60, burst: 'peak', origins: { na: 45, eu: 30, asia: 25 }, odds: {}, goalMs: 300 },
        { id: 'sc-stream-transcode', name: 'New release transcode', entry: 'Transcoder.file Uploads', rows: 20000, goalMin: 180, origins: {}, odds: {} }],
      [{ name: 'catalog-db', type: 'postgres', data: ['Catalog', 'Manifests'] }, { name: 'video-store', type: 'objects', data: ['VideoObjects', 'Uploads'] }, { name: 'view-stream', type: 'kafka', data: ['ViewEvents'] }],
      [{ name: 'catalog-db', type: 'postgres', repl: 'read-replicas', data: ['Catalog', 'Manifests'] }, { name: 'video-store', type: 'objects', repl: 'crr', data: ['VideoObjects', 'Uploads'] }, { name: 'view-stream', type: 'kafka', repl: 'single', regions: ['use1'], data: ['ViewEvents'] }]
    ),
    system('product-catalog', 'Product catalog', 'Show product pages with prices and reviews to holiday shoppers, while prices change in the background.',
      'Almost every request reads the same popular products. A cache in front takes those reads off the database. See what happens when it starts empty.',
      [
        { id: 'w1', name: 'CatalogAPI', x: 20, y: 80, code: 'when GetProduct {\n  read Products by product_id\n  read Prices by product_id\n  read Reviews by product_id many 5\n}\n\nwhen UpdatePrice {\n  update Prices by product_id\n}' }
      ],
      [
        data('d1', 'Products', 'table', [F('product_id', 'uuid', { key: true }), F('category', 'text', { index: true }), F('name', 'text')], 5e6, 2),
        data('d2', 'Prices', 'table', [F('product_id', 'uuid', { key: true }), F('amount', 'int'), F('updated_at', 'timestamp')], 5e6, 0.2),
        data('d3', 'Reviews', 'table', [F('review_id', 'uuid', { key: true }), F('product_id', 'uuid', { index: true }), F('body', 'text')], 2e8, 1)
      ],
      [{ id: 'sc-catalog-browse', name: 'Holiday browsing', entry: 'CatalogAPI.GetProduct', count: 1.8e7, durationMin: 60, burst: 'peak', origins: { na: 60, eu: 25, asia: 15 }, odds: {}, goalMs: 150 },
        { id: 'sc-catalog-prices', name: 'Price updates', entry: 'CatalogAPI.UpdatePrice', count: 360000, durationMin: 60, burst: 'steady', origins: { na: 100 }, odds: {}, goalMs: 200 }],
      [{ name: 'catalog-db', type: 'postgres', data: ['Products', 'Prices', 'Reviews'] }],
      [{ name: 'catalog-db', type: 'postgres', repl: 'read-replicas', cache: { hit: 0.95 }, data: ['Products', 'Prices', 'Reviews'] }]
    ),
    system('ticket-sale', 'Concert ticket sale', 'Sell a big concert the moment tickets go on sale: everyone wants the same event at the same time.',
      'All the traffic lands on one event, so one key is hot. More shards do not help, and retries can make the overload worse. Payments happen after the request returns.',
      [
        { id: 'w1', name: 'TicketAPI', x: 20, y: 80, code: 'when ViewEvent {\n  read Events by event_id\n  read Inventory by event_id\n}\n\nwhen Reserve {\n  read Events by event_id\n  update Inventory by event_id\n  insert Reservations\n  publish ReservationEvents\n}' },
        { id: 'w2', name: 'PaymentWorker', x: 300, y: 320, code: 'when message ReservationEvents {\n  call PaymentProvider.Charge\n  update Reservations by reservation_id\n}' },
        { id: 'w3', name: 'PaymentProvider', x: 20, y: 480, external: true, code: '# Runs outside your system. Use "compute" for the\n# response time you expect from the provider.\nwhen Charge {\n  compute 250ms\n}' }
      ],
      [
        data('d1', 'Events', 'table', [F('event_id', 'uuid', { key: true }), F('name', 'text'), F('starts_at', 'timestamp')], 50000, 2),
        data('d2', 'Inventory', 'kv', [F('event_id', 'uuid', { key: true }), F('seats_left', 'int')], 50000, 0.1),
        data('d3', 'Reservations', 'table', [F('reservation_id', 'uuid', { key: true }), F('event_id', 'uuid', { index: true }), F('status', 'text')], 5e7, 0.5),
        data('d4', 'ReservationEvents', 'queue', [F('reservation_id', 'uuid')], 0, 0.2)
      ],
      [{ id: 'sc-tickets-onsale', name: 'On-sale rush', entry: 'TicketAPI.Reserve', count: 900000, durationMin: 15, burst: 'peak', origins: { na: 80, eu: 20 }, odds: {}, hot: { Events: 0.7, Inventory: 0.7 }, goalMs: 400 },
        { id: 'sc-tickets-view', name: 'Fans refreshing the page', entry: 'TicketAPI.ViewEvent', count: 6e6, durationMin: 30, burst: 'peak', origins: { na: 80, eu: 20 }, odds: {}, hot: { Events: 0.8, Inventory: 0.8 }, goalMs: 200 }],
      [{ name: 'tickets-db', type: 'postgres', data: ['Events', 'Inventory', 'Reservations'] }, { name: 'payment-queue', type: 'queue', data: ['ReservationEvents'] }],
      [{ name: 'events-db', type: 'postgres', repl: 'read-replicas', cache: { hit: 0.98 }, data: ['Events', 'Reservations'] }, { name: 'inventory-kv', type: 'kv', repl: 'single', regions: ['use1'], data: ['Inventory'] }, { name: 'payment-queue', type: 'queue', repl: 'single', regions: ['use1'], data: ['ReservationEvents'] }]
    ),
    system('food-delivery', 'Food delivery marketplace', 'Search nearby restaurants, place orders, and coordinate couriers through asynchronous events.',
      'Dinner peaks stress restaurant and location lookups. Follow the order event to dispatch, then compare a single shared database with partitioned regional stores.',
      [
        { id: 'w1', name: 'MarketplaceAPI', x: 20, y: 80, code: 'when SearchRestaurants {\n  read Restaurants by city_id many 50\n}\n\nwhen PlaceOrder {\n  read Menus by restaurant_id many 10\n  insert Orders\n  publish OrderEvents\n}' },
        { id: 'w2', name: 'Dispatch', x: 300, y: 320, code: 'when message OrderEvents {\n  read CourierLocations by zone_id many 20\n  update Orders\n}' },
        { id: 'w3', name: 'CourierAPI', x: 20, y: 500, code: 'when UpdateLocation {\n  upsert CourierLocations\n}' }
      ],
      [
        data('d1', 'Restaurants', 'table', [F('restaurant_id', 'uuid', { key: true }), F('city_id', 'text', { index: true }), F('zone_id', 'text', { index: true })], 5e6, 1),
        data('d2', 'Menus', 'document', [F('restaurant_id', 'uuid', { key: true }), F('items', 'json')], 5e6, 2),
        data('d3', 'Orders', 'table', [F('order_id', 'uuid', { key: true }), F('restaurant_id', 'uuid', { index: true }), F('status', 'text')], 5e9, 0.7),
        data('d4', 'OrderEvents', 'queue', [F('order_id', 'uuid'), F('zone_id', 'text')], 0, 0.3),
        data('d5', 'CourierLocations', 'kv', [F('courier_id', 'uuid', { key: true }), F('zone_id', 'text', { index: true }), F('updated_at', 'timestamp')], 2e6, 0.2)
      ],
      [{ id: 'sc-food-dinner', name: 'Dinner rush', entry: 'MarketplaceAPI.SearchRestaurants', count: 6e6, durationMin: 60, burst: 'peak', origins: { na: 70, eu: 20, asia: 10 }, odds: {}, goalMs: 350 },
        { id: 'sc-food-orders', name: 'Order and dispatch surge', entry: 'MarketplaceAPI.PlaceOrder', count: 1.2e6, durationMin: 30, burst: 'ramp', origins: { na: 70, eu: 20, asia: 10 }, odds: {}, goalMs: 500 }],
      [{ name: 'marketplace-db', type: 'postgres', data: ['Restaurants', 'Menus', 'Orders'] }, { name: 'order-queue', type: 'queue', data: ['OrderEvents'] }, { name: 'location-store', type: 'kv', data: ['CourierLocations'] }],
      [{ name: 'marketplace-db', type: 'postgres', shards: 8, data: ['Restaurants', 'Menus', 'Orders'] }, { name: 'order-queue', type: 'queue', repl: 'single', regions: ['use1'], data: ['OrderEvents'] }, { name: 'location-store', type: 'kv', repl: 'multi-primary', data: ['CourierLocations'] }]
    )
  ];
}
if (typeof module !== 'undefined') module.exports = { exampleBuild, exampleDeploys, exampleSystems };
