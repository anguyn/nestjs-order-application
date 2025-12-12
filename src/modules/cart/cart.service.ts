import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@database/prisma.service';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  private async getOrCreateCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    }

    return cart;
  }

  async getCart(userId: string, lang = 'en') {
    const cart = await this.getOrCreateCart(userId);

    // Calculate totals
    let subtotal = 0;
    let totalItems = 0;

    for (const item of cart.items) {
      const itemTotal = Number(item.product.price) * item.quantity;
      subtotal += itemTotal;
      totalItems += item.quantity;
    }

    return {
      ...cart,
      subtotal,
      totalItems,
    };
  }

  async addToCart(userId: string, dto: AddToCartDto, lang = 'en') {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException(
        this.i18n.translate('product.not_found', { lang }),
      );
    }

    if (product.stock < dto.quantity) {
      throw new BadRequestException(
        this.i18n.translate('cart.insufficient_stock', { lang }),
      );
    }

    const cart = await this.getOrCreateCart(userId);

    // Check if item already in cart
    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: dto.productId,
        },
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + dto.quantity;

      if (product.stock < newQuantity) {
        throw new BadRequestException(
          this.i18n.translate('cart.insufficient_stock', { lang }),
        );
      }

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCart(userId, lang);
  }

  async updateCartItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
    lang = 'en',
  ) {
    const cart = await this.getOrCreateCart(userId);

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
      },
      include: { product: true },
    });

    if (!item) {
      throw new NotFoundException(
        this.i18n.translate('cart.item_not_found', { lang }),
      );
    }

    if (dto.quantity === 0) {
      await this.prisma.cartItem.delete({
        where: { id: itemId },
      });
    } else {
      if (item.product.stock < dto.quantity) {
        throw new BadRequestException(
          this.i18n.translate('cart.insufficient_stock', { lang }),
        );
      }

      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: dto.quantity },
      });
    }

    return this.getCart(userId, lang);
  }

  async removeFromCart(userId: string, itemId: string, lang = 'en') {
    const cart = await this.getOrCreateCart(userId);

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
      },
    });

    if (!item) {
      throw new NotFoundException(
        this.i18n.translate('cart.item_not_found', { lang }),
      );
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    return this.getCart(userId, lang);
  }

  async clearCart(userId: string, lang = 'en') {
    const cart = await this.getOrCreateCart(userId);

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.getCart(userId, lang);
  }
}
