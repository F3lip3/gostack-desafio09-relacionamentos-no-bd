import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);
    if (!customer) {
      throw new AppError('Customer not found');
    }

    const existentProducts = await this.productsRepository.findAllById(
      products.map(product => ({
        id: product.id,
      })),
    );

    if (existentProducts.length !== products.length) {
      throw new AppError('Some products could not be found');
    }

    const insufficientProductsAmount = existentProducts.filter(product => {
      const orderProductQuantity =
        products.find(prd => prd.id === product.id)?.quantity ?? 0;

      return orderProductQuantity > product.quantity;
    });

    if (insufficientProductsAmount.length) {
      const errors = insufficientProductsAmount.map(
        product =>
          `The product ${product.name} has only ${product.quantity} items left in stock.`,
      );
      throw new AppError(errors.join('\n'));
    }

    await this.productsRepository.updateQuantity(
      existentProducts.map(product => {
        const orderProductQuantity =
          products.find(prd => prd.id === product.id)?.quantity ?? 0;

        return {
          id: product.id,
          quantity: product.quantity - orderProductQuantity,
        };
      }),
    );

    const order = await this.ordersRepository.create({
      customer,
      products: existentProducts.map(product => {
        const orderProductQuantity =
          products.find(prd => prd.id === product.id)?.quantity ?? 0;
        return {
          product_id: product.id,
          quantity: orderProductQuantity,
          price: product.price,
        };
      }),
    });

    return order;
  }
}

export default CreateOrderService;
