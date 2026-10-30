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
if (typeof module !== 'undefined') module.exports = { exampleBuild, exampleDeploys };
