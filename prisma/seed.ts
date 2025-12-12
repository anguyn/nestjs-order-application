import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { ROLE_PERMISSIONS } from '@shared/constants/permissions.constant';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data (optional - comment out if you want to keep existing data)
  await prisma.voucherUsage.deleteMany();
  await prisma.voucherTemplate.deleteMany();
  await prisma.voucherInstance.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.editLock.deleteMany();
  await prisma.event.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  console.log('🗑️  Cleared existing data');

  // Hash password for users
  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // 1. Create Users
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      phone: '+84901234567',
      role: 'ADMIN',
      permissions: ROLE_PERMISSIONS.ADMIN,
      language: 'EN',
      isActive: true,
      isEmailVerified: true,
    },
  });

  const adminUser1 = await prisma.user.create({
    data: {
      email: 'admin1@example.com',
      password: hashedPassword,
      firstName: 'Admin 1',
      lastName: 'User',
      phone: '+84901234567',
      role: 'ADMIN',
      permissions: ROLE_PERMISSIONS.ADMIN,
      language: 'EN',
      isActive: true,
      isEmailVerified: true,
    },
  });

  // const merchantUser = await prisma.user.create({
  //   data: {
  //     email: 'merchant@example.com',
  //     password: hashedPassword,
  //     firstName: 'Merchant',
  //     lastName: 'User',
  //     phone: '+84901234568',
  //     role: 'MERCHANT',
  //     permissions: ['manage_products', 'view_orders'],
  //     language: 'VI',
  //     isActive: true,
  //     isEmailVerified: true,
  //   },
  // });

  const regularUsers = await Promise.all([
    prisma.user.create({
      data: {
        email: 'user1@example.com',
        password: hashedPassword,
        firstName: 'Nguyen',
        lastName: 'Van A',
        phone: '+84901234569',
        role: 'USER',
        permissions: ROLE_PERMISSIONS.USER,
        language: 'VI',
        isActive: true,
        isEmailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'user2@example.com',
        password: hashedPassword,
        firstName: 'Tran',
        lastName: 'Thi B',
        phone: '+84901234570',
        role: 'USER',
        permissions: ROLE_PERMISSIONS.USER,
        language: 'VI',
        isActive: true,
        isEmailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'user3@example.com',
        password: hashedPassword,
        firstName: 'Le',
        lastName: 'Van C',
        phone: '+84901234571',
        role: 'USER',
        permissions: ROLE_PERMISSIONS.USER,
        language: 'EN',
        isActive: true,
        isEmailVerified: false,
      },
    }),
  ]);

  console.log('✅ Created users:', {
    admin: adminUser.email,
    admin1: adminUser1.email,
    // merchant: merchantUser.email,
    users: regularUsers.map((u) => u.email),
  });

  // 2. Create Addresses
  const addresses = await Promise.all([
    prisma.address.create({
      data: {
        userId: regularUsers[0].id,
        fullName: 'Nguyen Van A',
        phone: '+84901234569',
        address: '123 Nguyen Hue',
        ward: 'Phuong Ben Nghe',
        district: 'Quan 1',
        city: 'Ho Chi Minh',
        isDefault: true,
      },
    }),
    prisma.address.create({
      data: {
        userId: regularUsers[0].id,
        fullName: 'Nguyen Van A (Office)',
        phone: '+84901234569',
        address: '456 Le Loi',
        ward: 'Phuong Ben Thanh',
        district: 'Quan 1',
        city: 'Ho Chi Minh',
        isDefault: false,
      },
    }),
    prisma.address.create({
      data: {
        userId: regularUsers[1].id,
        fullName: 'Tran Thi B',
        phone: '+84901234570',
        address: '789 Tran Hung Dao',
        ward: 'Phuong Cau Kho',
        district: 'Quan 1',
        city: 'Ho Chi Minh',
        isDefault: true,
      },
    }),
    prisma.address.create({
      data: {
        userId: regularUsers[2].id,
        fullName: 'Le Van C',
        phone: '+84901234571',
        address: '321 Vo Thi Sau',
        ward: 'Phuong 7',
        district: 'Quan 3',
        city: 'Ho Chi Minh',
        isDefault: true,
      },
    }),
    prisma.address.create({
      data: {
        userId: regularUsers[2].id,
        fullName: 'Vo Trang E (Office)',
        phone: '+84901234571',
        address: '32 Le Van Duyet',
        ward: 'Phuong 5',
        district: 'Quan Binh Thanh',
        city: 'Ho Chi Minh',
        isDefault: false,
      },
    }),
  ]);

  console.log('✅ Created addresses:', addresses.length);

  // 3. Create Products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'MacBook Pro 16" M3 Max',
        slug: 'macbook-pro-16-m3-max',
        description:
          'Powerful laptop with M3 Max chip, 16" Liquid Retina XDR display, 36GB RAM, 1TB SSD',
        price: 15000,
        comparePrice: 20000,
        stock: 15,
        sku: 'MBP-M3MAX-16-1TB',
        images: [
          'https://images.unsplash.com/photo-1517336714731-489689fd1ca8',
          'https://images.unsplash.com/photo-1484788984921-03950022c9ef',
        ],
        status: 'ACTIVE',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'iPhone 15 Pro Max 256GB',
        slug: 'iphone-15-pro-max-256gb',
        description:
          'Latest iPhone with A17 Pro chip, titanium design, 48MP camera system',
        price: 10000,
        comparePrice: 15000,
        stock: 30,
        sku: 'IP15PM-256-TBL',
        images: [
          'https://images.unsplash.com/photo-1592286927505-b69f3feadd95',
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9',
        ],
        status: 'ACTIVE',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'AirPods Pro (2nd generation)',
        slug: 'airpods-pro-2nd-gen',
        description: 'Active Noise Cancellation, Adaptive Audio, H2 chip',
        price: 5000,
        comparePrice: 10000,
        stock: 50,
        sku: 'APP-2ND-GEN',
        images: [
          'https://images.unsplash.com/photo-1606841837239-c5a1a4a07af7',
        ],
        status: 'ACTIVE',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'iPad Air M2 11" WiFi 128GB',
        slug: 'ipad-air-m2-11-128gb',
        description: 'Powerful tablet with M2 chip, 11" Liquid Retina display',
        price: 14000,
        comparePrice: 19000,
        stock: 25,
        sku: 'IPA-M2-11-128',
        images: ['https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0'],
        status: 'ACTIVE',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Apple Watch Series 9 GPS 45mm',
        slug: 'apple-watch-series-9-45mm',
        description:
          'Advanced health and fitness features, always-on Retina display',
        price: 10000,
        stock: 20,
        sku: 'AWS9-GPS-45',
        images: [
          'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d',
        ],
        status: 'ACTIVE',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Magic Keyboard for iPad Pro',
        slug: 'magic-keyboard-ipad-pro',
        description: 'Backlit keys, trackpad, USB-C charging port',
        price: 3500,
        stock: 15,
        sku: 'MK-IPP-12.9',
        images: [
          'https://images.unsplash.com/photo-1587829741301-dc798b83add3',
        ],
        status: 'ACTIVE',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Apple Pencil (2nd generation)',
        slug: 'apple-pencil-2nd-gen',
        description:
          'Pixel-perfect precision, magnetic attachment and wireless charging',
        price: 6000,
        stock: 40,
        sku: 'APENCIL-2ND',
        images: [
          'https://images.unsplash.com/photo-1625948515291-69613efd103f',
        ],
        status: 'ACTIVE',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'HomePod mini - Space Gray',
        slug: 'homepod-mini-space-gray',
        description: 'Smart speaker with Siri, 360-degree audio',
        price: 8500,
        stock: 0,
        sku: 'HPM-SPACEGRAY',
        images: [
          'https://images.unsplash.com/photo-1589003077984-894e133dabab',
        ],
        status: 'OUT_OF_STOCK',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'MagSafe Charger',
        slug: 'magsafe-charger',
        description: 'Wireless charging for iPhone 12 and later',
        price: 3000,
        stock: 100,
        sku: 'MS-CHARGER',
        images: [
          'https://images.unsplash.com/photo-1591337676887-a217a6970a8a',
        ],
        status: 'ACTIVE',
        createdBy: adminUser.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'iPhone 16 Pro Max 512GB - Coming Soon',
        slug: 'iphone-16-pro-max-512gb',
        description: 'Next generation iPhone (Pre-order)',
        price: 18000,
        stock: 0,
        sku: 'IP16PM-512-TBL',
        images: [],
        status: 'DRAFT',
        createdBy: adminUser.id,
      },
    }),
  ]);

  console.log('✅ Created products:', products.length);

  // // 4. Create Events
  const now = new Date();
  const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

  const events = await Promise.all([
    prisma.event.create({
      data: {
        title: 'New Year Sale 2026',
        slug: 'new-year-sale-2026',
        description:
          'Start the new year with amazing deals! Get up to 50% off on selected products.',
        startDate: now,
        endDate: futureDate,
        maxVouchers: 500,
        issuedCount: 0,
        isActive: true,
        createdBy: adminUser.id,
      },
    }),
    prisma.event.create({
      data: {
        title: 'Flash Sale - Weekend Only',
        slug: 'flash-sale-weekend',
        description: '48-hour flash sale! Limited quantities available.',
        startDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
        maxVouchers: 300,
        issuedCount: 0,
        isActive: true,
        createdBy: adminUser.id,
      },
    }),
    prisma.event.create({
      data: {
        title: 'VIP Member Exclusive',
        slug: 'vip-member-exclusive',
        description: 'Special discounts for our valued VIP members',
        startDate: now,
        endDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
        maxVouchers: 100,
        issuedCount: 0,
        isActive: true,
        createdBy: adminUser.id,
      },
    }),
  ]);

  console.log('✅ Created events:', events.length);

  // Create Voucher TEMPLATES
  const templates = await Promise.all([
    // Template 1: SINGLE_USE + FIXED - Event New Year Sale
    prisma.voucherTemplate.create({
      data: {
        eventId: events[0].id,
        name: 'Giảm 10k cho đơn từ 50k',
        description: 'Áp dụng cho đơn hàng từ 50k trở lên',
        discountType: 'FIXED',
        discountValue: 10000,
        minOrderAmount: 50000,
        type: 'SINGLE_USE',
        maxPerUser: 1,
        maxIssue: 200,
        issuedCount: 0,
        isActive: true,
      },
    }),

    // Template 2: SINGLE_USE + FREE_SHIPPING - Event New Year Sale
    prisma.voucherTemplate.create({
      data: {
        eventId: events[0].id,
        name: 'Freeship toàn quốc',
        description: 'Miễn phí vận chuyển cho mọi đơn hàng',
        discountType: 'FREE_SHIPPING',
        discountValue: 50000,
        minOrderAmount: 0,
        type: 'SINGLE_USE',
        maxPerUser: 1,
        maxIssue: 300,
        issuedCount: 0,
        isActive: true,
      },
    }),

    // Template 3: MULTI_USE + PERCENTAGE - Event Flash Sale
    prisma.voucherTemplate.create({
      data: {
        eventId: events[1].id,
        name: 'Flash Sale - Giảm 15% (Dùng nhiều lần)',
        description: 'Voucher có thể dùng nhiều lần trong thời gian Flash Sale',
        code: 'FLASH15',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        minOrderAmount: 100000,
        maxDiscountAmount: 20000,
        type: 'MULTI_USE',
        maxUsageCount: 5,
        maxPerUser: 1,
        maxIssue: 300,
        issuedCount: 0,
        isActive: true,
      },
    }),

    // Template 4: SPECIFIC_USER + PERCENTAGE - Event VIP
    prisma.voucherTemplate.create({
      data: {
        eventId: events[2].id,
        name: 'VIP - Giảm 20%',
        description: 'Chỉ dành cho VIP members',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderAmount: 50000,
        maxDiscountAmount: 150000,
        type: 'SPECIFIC_USER',
        targetUserIds: [regularUsers[0].id, regularUsers[1].id],
        maxPerUser: 2,
        maxIssue: 100,
        issuedCount: 0,
        isActive: true,
      },
    }),
  ]);

  console.log('✅ Created templates:', templates.length);

  // // 6. Create Carts for users
  // const carts = await Promise.all([
  //   prisma.cart.create({
  //     data: {
  //       userId: regularUsers[0].id,
  //       items: {
  //         create: [
  //           {
  //             productId: products[0].id, // MacBook
  //             quantity: 1,
  //           },
  //           {
  //             productId: products[2].id, // AirPods
  //             quantity: 2,
  //           },
  //         ],
  //       },
  //     },
  //   }),
  //   prisma.cart.create({
  //     data: {
  //       userId: regularUsers[1].id,
  //       items: {
  //         create: [
  //           {
  //             productId: products[1].id, // iPhone
  //             quantity: 1,
  //           },
  //           {
  //             productId: products[4].id, // Apple Watch
  //             quantity: 1,
  //           },
  //         ],
  //       },
  //     },
  //   }),
  //   prisma.cart.create({
  //     data: {
  //       userId: regularUsers[2].id,
  //       items: {
  //         create: [
  //           {
  //             productId: products[3].id, // iPad
  //             quantity: 1,
  //           },
  //         ],
  //       },
  //     },
  //   }),
  // ]);

  // console.log('✅ Created carts:', carts.length);

  console.log('🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`- Users: ${3 + regularUsers.length}`);
  console.log(`- Addresses: ${addresses.length}`);
  console.log(`- Products: ${products.length}`);
  console.log(`- Events: ${events.length}`);
  console.log(`- Voucher templates: ${templates.length}`);
  // console.log(`- Carts: ${carts.length}`);
  console.log('\n🔑 Test Credentials:');
  console.log('Admin: admin@example.com / Password123!');
  // console.log('Merchant: merchant@example.com / Password123!');
  console.log('User: user1@example.com / Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
