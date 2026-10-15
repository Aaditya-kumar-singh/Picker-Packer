/**
 * Standalone Reference REST Backend for YBM Picker & Packer
 * Implements full REST contracts defined in picker-app-api.md and packer-app-api.md.
 * Built using pure Node.js (zero external dependencies).
 */

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 8080;

// Seed Users
let users = [
  {
    id: 1,
    staffId: 1,
    name: 'Ravi Kumar',
    phone: '9876543210',
    mobileNumber: '9876543210',
    email: 'picker.test@yourbuildmart.com',
    role: 'ROLE_PICKER',
    warehouseId: 3,
    status: 'active',
    active: true,
    rating: 4.8,
    idCardType: 'AADHAAR',
    idCardNumber: 'XXXX-1234',
    address: 'Warehouse 3',
    photoFilePath: 'staff/ravi.jpg',
    password: 'password123',
    createdAt: '2026-01-15T09:00:00Z'
  },
  {
    id: 2,
    staffId: 2,
    name: 'Pooja Sharma',
    phone: '9876543211',
    mobileNumber: '9876543211',
    email: 'packer.test@yourbuildmart.com',
    role: 'ROLE_PACKER',
    warehouseId: 3,
    status: 'active',
    active: true,
    rating: 4.9,
    idCardType: 'AADHAAR',
    idCardNumber: 'XXXX-5678',
    address: 'Warehouse 3',
    photoFilePath: 'staff/pooja.jpg',
    password: 'password123',
    createdAt: '2026-01-15T09:00:00Z'
  }
];

let packers = [
  {
    id: 2,
    name: 'Pooja Sharma',
    phone: '9876543211',
    mobileNumber: '9876543211',
    rating: 4.9,
    photoFilePath: 'staff/pooja.jpg',
    warehouseId: 3,
    status: 'active',
    loginEnabled: true
  },
  {
    id: 21,
    name: 'Suresh Raina',
    phone: '9876543215',
    mobileNumber: '9876543215',
    rating: 4.5,
    photoFilePath: null,
    warehouseId: 3,
    status: 'active',
    loginEnabled: true
  }
];

let riders = [
  {
    id: 5,
    name: 'Amit Patel',
    phone: '9876543220',
    mobileNumber: '9876543220',
    vehicleNumber: 'MH-02-AB-1234',
    rating: 4.7,
    status: 'active'
  },
  {
    id: 6,
    name: 'Vikas Singh',
    phone: '9876543221',
    mobileNumber: '9876543221',
    vehicleNumber: 'MH-02-CD-5678',
    rating: 4.6,
    status: 'active'
  }
];

let orders = [
  {
    orderId: 501,
    orderNumber: 'SO-2026-00412',
    orderStatus: 'PICKING',
    orderDate: '2026-10-13T09:15:00',
    grandTotal: 2499.00,
    paymentMethod: 'COD',
    warehouseId: 3,
    warehouseName: null,
    customerName: null,
    customerPhone: null,
    shippingAddress: null,
    fulfillmentStaffId: null,
    fulfillmentStaffName: null,
    fulfillmentStartedAt: null,
    fulfillmentCompletedAt: null,
    pickerId: 1,
    packerId: null,
    packerAssignedAt: null,
    totalItems: 2,
    totalItemsScanned: 0,
    items: [
      {
        itemId: 9001,
        productId: 42,
        variantId: 903,
        sku: 'TSH-M-NVY',
        productName: 'Classic Cotton T-Shirt',
        variantLabel: 'Size: M, Color: Navy',
        orderedQty: 2,
        pickedQty: 0,
        packedQty: 0,
        fullyScanned: false,
        zone: 'A',
        aisle: '03',
        rack: 'R2',
        bin: 'B7',
        shelf: 'S1',
        locationCode: 'A-03-R2-B7-S1',
        barcode: '8901234567890'
      },
      {
        itemId: 9002,
        productId: 43,
        variantId: 904,
        sku: 'JN-32-BLU',
        productName: 'Slim Fit Denim Jeans',
        variantLabel: 'Size: 32, Color: Blue',
        orderedQty: 1,
        pickedQty: 0,
        packedQty: 0,
        fullyScanned: false,
        zone: 'B',
        aisle: '01',
        rack: 'R1',
        bin: 'B2',
        shelf: 'S2',
        locationCode: 'B-01-R1-B2-S2',
        barcode: '8901234567891'
      }
    ]
  },
  {
    orderId: 502,
    orderNumber: 'SO-2026-00413',
    orderStatus: 'PACKING',
    orderDate: '2026-10-13T10:00:00',
    grandTotal: 1599.00,
    paymentMethod: 'PREPAID',
    warehouseId: 3,
    warehouseName: null,
    customerName: null,
    customerPhone: null,
    shippingAddress: null,
    fulfillmentStaffId: null,
    fulfillmentStaffName: null,
    fulfillmentStartedAt: null,
    fulfillmentCompletedAt: null,
    pickerId: 1,
    packerId: 2,
    packerAssignedAt: '2026-10-13T10:45:00',
    totalItems: 1,
    totalItemsScanned: 1,
    items: [
      {
        itemId: 9003,
        productId: 44,
        variantId: 905,
        sku: 'SH-L-WHT',
        productName: 'Oxford Button Down Shirt',
        variantLabel: 'Size: L, Color: White',
        orderedQty: 1,
        pickedQty: 1,
        packedQty: 0,
        fullyScanned: true,
        zone: 'A',
        aisle: '02',
        rack: 'R3',
        bin: 'B1',
        shelf: 'S1',
        locationCode: 'A-02-R3-B1-S1',
        barcode: '8901234567892'
      }
    ]
  }
];

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-id'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function authenticate(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  if (token.startsWith('mock-jwt-token-')) {
    const parts = token.replace('mock-jwt-token-', '').split('-');
    const userId = parseInt(parts[0], 10);
    return users.find(u => u.id === userId) || users[0];
  }
  return users[0];
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-id'
    });
    return res.end();
  }

  try {
    // 1. Auth Endpoints
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const identifier = body.mobileNumber || body.identifier;
      const user = users.find(u => u.mobileNumber === identifier || u.email === identifier) || users[0];
      return sendJson(res, 200, {
        success: true,
        message: 'Login successful',
        data: {
          token: `mock-jwt-token-${user.id}-${user.role.toLowerCase()}`,
          user: {
            id: user.id,
            staffId: user.staffId,
            name: user.name,
            phone: user.phone,
            mobileNumber: user.mobileNumber,
            role: user.role === 'ROLE_PICKER' ? 'PICKER' : 'PACKER',
            roles: [user.role],
            warehouseId: user.warehouseId,
            active: user.active
          }
        }
      });
    }

    if (path === '/api/auth/otp/request' && method === 'POST') {
      const body = await parseBody(req);
      return sendJson(res, 200, {
        success: true,
        message: `OTP sent successfully to ${body.mobileNumber || 'registered mobile'}`,
        data: { otpExpirySeconds: 300 }
      });
    }

    // Auth verification
    const currentUser = authenticate(req);
    if (!currentUser && (path.startsWith('/api/picker-app') || path.startsWith('/api/packer-app'))) {
      return sendJson(res, 401, {
        traceId: 'unauth-1',
        error: 'UNAUTHORIZED',
        message: 'Authentication token required or expired',
        status: 401,
        fieldErrors: null,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Picker App Endpoints
    if (path === '/api/picker-app/stats' && method === 'GET') {
      const assigned = orders.filter(o => o.pickerId === currentUser.id && (o.orderStatus === 'PICKING' || o.orderStatus === 'PACKING')).length;
      return sendJson(res, 200, {
        success: true,
        message: 'Stats fetched successfully',
        data: {
          assignedOrdersCount: assigned,
          completedOrdersCount: 7,
          totalItemsPickedToday: 53
        }
      });
    }

    if ((path === '/api/picker-app/orders/assigned' || path === '/api/picker-app/assigned-orders') && method === 'GET') {
      const assigned = orders.filter(o => o.pickerId === currentUser.id && o.orderStatus === 'PICKING');
      return sendJson(res, 200, {
        success: true,
        message: 'Assigned orders fetched successfully',
        data: assigned
      });
    }

    if (path.match(/^\/api\/picker-app\/orders\/(\d+)\/items$/) && method === 'GET') {
      const orderId = parseInt(path.split('/')[4], 10);
      const order = orders.find(o => o.orderId === orderId);
      if (!order) {
        return sendJson(res, 404, { traceId: 'err-404', error: 'NOT_FOUND', message: 'Order not found', status: 404 });
      }
      return sendJson(res, 200, {
        success: true,
        message: 'Order items fetched successfully',
        data: order.items
      });
    }

    if (path.match(/^\/api\/picker-app\/orders\/(\d+)\/scan$/) && method === 'POST') {
      const orderId = parseInt(path.split('/')[4], 10);
      const body = await parseBody(req);
      const order = orders.find(o => o.orderId === orderId);
      if (!order) return sendJson(res, 404, { traceId: 'err-404', error: 'NOT_FOUND', message: 'Order not found', status: 404 });

      const scannedBarcode = (body.barcode || body.sku || '').trim();
      const item = order.items.find(i => i.barcode === scannedBarcode || i.sku === scannedBarcode || i.sku === body.sku);

      if (!item || (item.barcode && item.barcode !== scannedBarcode && item.sku !== scannedBarcode)) {
        // Soft failure HTTP 400 with success: false
        return sendJson(res, 400, {
          success: false,
          message: `This barcode does not belong to this order.`,
          data: {
            success: false,
            message: `This barcode does not belong to this order.`,
            barcode: scannedBarcode,
            scannedItemName: null,
            scannedQty: 0,
            orderedQty: 0,
            totalItemsPicked: order.totalItemsScanned,
            totalItems: order.totalItems,
            orderStatus: order.orderStatus,
            orderFullyPicked: false,
            scannedAt: new Date().toISOString(),
            items: order.items
          }
        });
      }

      // Successful pick
      item.pickedQty = Math.min(item.orderedQty, item.pickedQty + 1);
      item.fullyScanned = item.pickedQty >= item.orderedQty;

      order.totalItemsScanned = order.items.filter(i => i.fullyScanned).length;
      const allPicked = order.items.every(i => i.fullyScanned);

      return sendJson(res, 200, {
        success: true,
        message: allPicked ? 'All items picked! Order is ready for packing.' : 'Item scanned successfully.',
        data: {
          success: true,
          message: allPicked ? 'All items picked! Order is ready for packing.' : 'Item scanned successfully.',
          barcode: scannedBarcode,
          scannedItemName: `${item.productName} - ${item.variantLabel || ''}`,
          scannedQty: item.pickedQty,
          orderedQty: item.orderedQty,
          totalItemsPicked: order.totalItemsScanned,
          totalItems: order.totalItems,
          orderStatus: 'PICKING',
          orderFullyPicked: allPicked,
          scannedAt: new Date().toISOString(),
          items: order.items
        }
      });
    }

    if (path === '/api/picker-app/available-packers' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        message: 'Available packers fetched successfully',
        data: packers
      });
    }

    if (path.match(/^\/api\/picker-app\/orders\/(\d+)\/assign-packer$/) && method === 'POST') {
      const orderId = parseInt(path.split('/')[4], 10);
      const body = await parseBody(req);
      const order = orders.find(o => o.orderId === orderId);
      if (!order) return sendJson(res, 404, { traceId: 'err-404', error: 'NOT_FOUND', message: 'Order not found', status: 404 });

      const packerId = body.packerId || body.packerStaffId;
      const packer = packers.find(p => p.id === packerId) || packers[0];
      order.orderStatus = 'PACKING';
      order.packerId = packer.id;
      order.packerAssignedAt = new Date().toISOString();

      return sendJson(res, 200, {
        success: true,
        message: 'Packer assigned successfully',
        data: 'Packer assigned'
      });
    }

    if (path === '/api/picker-app/profile' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        message: 'Profile fetched successfully',
        data: {
          staffId: currentUser.staffId,
          name: currentUser.name,
          phone: currentUser.phone,
          email: currentUser.email,
          status: currentUser.status,
          rating: currentUser.rating,
          idCardType: currentUser.idCardType,
          idCardNumber: currentUser.idCardNumber,
          address: currentUser.address,
          photoFilePath: currentUser.photoFilePath
        }
      });
    }

    if (path === '/api/picker-app/profile' && method === 'PUT') {
      const body = await parseBody(req);
      if (body.name) currentUser.name = body.name;
      if (body.phone) currentUser.phone = body.phone;
      if (body.address) currentUser.address = body.address;
      return sendJson(res, 200, {
        success: true,
        message: 'Profile updated successfully',
        data: {
          staffId: currentUser.staffId,
          name: currentUser.name,
          phone: currentUser.phone,
          email: currentUser.email,
          status: currentUser.status,
          rating: currentUser.rating,
          idCardType: currentUser.idCardType,
          idCardNumber: currentUser.idCardNumber,
          address: currentUser.address,
          photoFilePath: currentUser.photoFilePath
        }
      });
    }

    if (path === '/api/picker-app/change-password' && method === 'POST') {
      return sendJson(res, 200, {
        success: true,
        message: 'Password updated successfully',
        data: 'Password updated'
      });
    }

    // 3. Packer App Endpoints
    if (path === '/api/packer-app/stats' && method === 'GET') {
      const assigned = orders.filter(o => o.packerId === currentUser.id && o.orderStatus === 'PACKING').length;
      return sendJson(res, 200, {
        success: true,
        message: 'Stats fetched successfully',
        data: {
          assignedOrdersCount: assigned,
          completedOrdersCount: 5,
          totalItemsPackedToday: 32
        }
      });
    }

    if ((path === '/api/packer-app/orders/assigned' || path === '/api/packer-app/assigned-orders') && method === 'GET') {
      const assigned = orders.filter(o => o.packerId === currentUser.id && o.orderStatus === 'PACKING');
      return sendJson(res, 200, {
        success: true,
        message: 'Assigned orders fetched successfully',
        data: assigned
      });
    }

    if (path.match(/^\/api\/packer-app\/orders\/(\d+)$/) && method === 'GET') {
      const orderId = parseInt(path.split('/')[4], 10);
      const order = orders.find(o => o.orderId === orderId);
      if (!order) return sendJson(res, 404, { traceId: 'err-404', error: 'NOT_FOUND', message: 'Order not found', status: 404 });
      return sendJson(res, 200, {
        success: true,
        message: 'Order detail fetched successfully',
        data: order
      });
    }

    if (path.match(/^\/api\/packer-app\/orders\/(\d+)\/scan$/) && method === 'POST') {
      const orderId = parseInt(path.split('/')[4], 10);
      const body = await parseBody(req);
      const order = orders.find(o => o.orderId === orderId);
      if (!order) return sendJson(res, 404, { traceId: 'err-404', error: 'NOT_FOUND', message: 'Order not found', status: 404 });

      const scannedBarcode = (body.barcode || body.sku || '').trim();
      const item = order.items.find(i => i.barcode === scannedBarcode || i.sku === scannedBarcode || i.sku === body.sku);

      if (!item || (item.barcode && item.barcode !== scannedBarcode && item.sku !== scannedBarcode)) {
        return sendJson(res, 400, {
          success: false,
          message: `Scanned barcode '${scannedBarcode}' does not match SKU '${body.sku || ''}'`,
          data: {
            success: false,
            message: `Scanned barcode '${scannedBarcode}' does not match SKU '${body.sku || ''}'`,
            barcode: scannedBarcode,
            scannedItemName: null,
            scannedQty: 0,
            orderedQty: 0,
            totalItemsPacked: order.totalItemsScanned,
            totalItems: order.totalItems,
            orderStatus: order.orderStatus,
            orderFullyPacked: false,
            scannedAt: new Date().toISOString(),
            items: order.items
          }
        });
      }

      item.packedQty = Math.min(item.orderedQty, item.packedQty + 1);
      const allPacked = order.items.every(i => i.packedQty >= i.orderedQty);
      if (allPacked) {
        order.orderStatus = 'PACKED';
      }

      return sendJson(res, 200, {
        success: true,
        message: allPacked ? 'All items packed! Order is ready for dispatch.' : 'Item scanned and packed.',
        data: {
          success: true,
          message: allPacked ? 'All items packed! Order is ready for dispatch.' : 'Item scanned and packed.',
          barcode: scannedBarcode,
          scannedItemName: `${item.productName} - ${item.variantLabel || ''}`,
          scannedQty: item.packedQty,
          orderedQty: item.orderedQty,
          totalItemsPacked: order.items.filter(i => i.packedQty >= i.orderedQty).length,
          totalItems: order.totalItems,
          orderStatus: order.orderStatus,
          orderFullyPacked: allPacked,
          scannedAt: new Date().toISOString(),
          items: order.items
        }
      });
    }

    if ((path === '/api/packer-app/riders/available' || path === '/api/packer-app/available-riders') && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        message: 'Available riders fetched successfully',
        data: riders
      });
    }

    if (path.match(/^\/api\/packer-app\/orders\/(\d+)\/assign-rider$/) && method === 'POST') {
      const orderId = parseInt(path.split('/')[4], 10);
      const body = await parseBody(req);
      const order = orders.find(o => o.orderId === orderId);
      if (!order) return sendJson(res, 404, { traceId: 'err-404', error: 'NOT_FOUND', message: 'Order not found', status: 404 });

      const rider = riders.find(r => r.id === body.riderId) || riders[0];
      order.orderStatus = 'RIDER_ASSIGNED';

      return sendJson(res, 200, {
        success: true,
        message: `Rider assigned successfully`,
        data: 'Rider assigned'
      });
    }

    if (path === '/api/packer-app/orders/packed' && method === 'GET') {
      const packedOrders = orders.filter(o => o.orderStatus === 'PACKED');
      return sendJson(res, 200, {
        success: true,
        message: 'Packed orders fetched successfully',
        data: packedOrders
      });
    }

    if (path === '/api/packer-app/orders/dispatched' && method === 'GET') {
      const dispatchedOrders = orders.filter(o => o.orderStatus === 'DISPATCHED' || o.orderStatus === 'RIDER_ASSIGNED');
      return sendJson(res, 200, {
        success: true,
        message: 'Dispatched orders fetched successfully',
        data: dispatchedOrders
      });
    }

    if (path === '/api/packer-app/profile' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        message: 'Profile fetched successfully',
        data: {
          staffId: currentUser.staffId,
          name: currentUser.name,
          phone: currentUser.phone,
          email: currentUser.email,
          status: currentUser.status,
          rating: currentUser.rating,
          idCardType: currentUser.idCardType,
          idCardNumber: currentUser.idCardNumber,
          address: currentUser.address,
          photoFilePath: currentUser.photoFilePath
        }
      });
    }

    if (path === '/api/packer-app/profile' && method === 'PUT') {
      const body = await parseBody(req);
      if (body.name) currentUser.name = body.name;
      if (body.phone) currentUser.phone = body.phone;
      if (body.address) currentUser.address = body.address;
      return sendJson(res, 200, {
        success: true,
        message: 'Profile updated successfully',
        data: {
          staffId: currentUser.staffId,
          name: currentUser.name,
          phone: currentUser.phone,
          email: currentUser.email,
          status: currentUser.status,
          rating: currentUser.rating,
          idCardType: currentUser.idCardType,
          idCardNumber: currentUser.idCardNumber,
          address: currentUser.address,
          photoFilePath: currentUser.photoFilePath
        }
      });
    }

    if (path === '/api/packer-app/change-password' && method === 'POST') {
      return sendJson(res, 200, {
        success: true,
        message: 'Password updated successfully',
        data: 'Password updated'
      });
    }

    return sendJson(res, 404, {
      traceId: 'not-found',
      error: 'NOT_FOUND',
      message: `Endpoint ${method} ${path} not found`,
      status: 404,
      fieldErrors: null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Unhandled server error:', err);
    return sendJson(res, 500, {
      traceId: 'internal-error',
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Internal Server Error',
      status: 500,
      fieldErrors: null,
      timestamp: new Date().toISOString()
    });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Reference REST backend listening on port ${PORT}`);
  });
}

module.exports = server;
