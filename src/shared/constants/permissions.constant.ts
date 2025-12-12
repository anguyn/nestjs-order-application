export enum Permission {
  // Events
  EVENT_CREATE = 'event:create',
  EVENT_UPDATE = 'event:update',
  EVENT_DELETE = 'event:delete',
  EVENT_READ = 'event:read',
  EVENT_READ_ALL = 'event:read:all',

  // Vouchers
  VOUCHER_CREATE = 'voucher:create',
  VOUCHER_ISSUE = 'voucher:issue',
  VOUCHER_USE = 'voucher:use',
  VOUCHER_READ = 'voucher:read',
  VOUCHER_READ_ALL = 'voucher:read:all',
  VOUCHER_UPDATE = 'voucher:update',
  VOUCHER_DELETE = 'voucher:delete',

  // Orders
  ORDER_CREATE = 'order:create',
  ORDER_READ = 'order:read',
  ORDER_READ_ALL = 'order:read:all',
  ORDER_UPDATE = 'order:update',
  ORDER_UPDATE_ALL = 'order:update:all',
  ORDER_CANCEL = 'order:cancel',

  // Users
  USER_READ = 'user:read',
  USER_READ_ALL = 'user:read:all',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',

  // Payment
  PAYMENT_VERIFY = 'payment:verify',
  PAYMENT_QUEUE_CLEAR = 'payment:queue:clear',
}

export const ROLE_PERMISSIONS = {
  ADMIN: Object.values(Permission),
  MERCHANT: [
    Permission.EVENT_CREATE,
    Permission.EVENT_UPDATE,
    Permission.EVENT_DELETE,
    Permission.EVENT_READ,
    Permission.EVENT_READ_ALL,
    Permission.VOUCHER_CREATE,
    Permission.VOUCHER_ISSUE,
    Permission.VOUCHER_READ,
    Permission.VOUCHER_READ_ALL,
    Permission.VOUCHER_UPDATE,
    Permission.ORDER_READ_ALL,
  ],
  USER: [
    Permission.EVENT_READ,
    Permission.VOUCHER_ISSUE,
    Permission.VOUCHER_USE,
    Permission.VOUCHER_READ,
    Permission.ORDER_CREATE,
    Permission.ORDER_READ,
    Permission.ORDER_CANCEL,
    Permission.USER_READ,
  ],
};
