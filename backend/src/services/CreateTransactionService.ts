/* eslint-disable array-callback-return */
/* eslint-disable no-param-reassign */
import { getCustomRepository } from 'typeorm';

import TransactionRepository from '../repositories/TransactionRepository';
import Transaction from '../models/Transaction';

import CreateCategoryService from './CreateCategoryService';

import AppError from '../errors/AppError';

export default class CreateTransactionService {
    public async execute(transactions: Transaction[]): Promise<Transaction[]> {
        if (!transactions) {
            throw new AppError('Invalid transaction type.');
        }
        const transactionsRepository = getCustomRepository(
            TransactionRepository,
        );
        const createCategory = new CreateCategoryService();

        // Check if all transactions have the same type, if not, reject all the batch transactions
        transactions.map(({ type }) => {
            if (type !== 'income' && type !== 'outcome') {
                throw new AppError('Invalid transaction type.');
            }
        });

        let { total } = await transactionsRepository.getBalance();

        // Check if have sufficient founds to insert all transactions in order
        transactions.map(({ type, value }) => {
            if (type === 'income') {
                total += Number(value);
            } else if (total > value) {
                total -= Number(value);
            } else {
                throw new AppError('Insufficient founds.');
            }
        });

        // Get the unique categories
        const uniqueCategories = transactions.filter(
            (thing, i, arr) =>
                arr.findIndex(
                    t => t.category.title === thing.category.title,
                ) === i,
        );

        // Check if category exists, if not save it.
        await Promise.all(
            uniqueCategories.map(async ({ category }) => {
                await createCategory.execute({
                    title: (category as unknown) as string,
                });
            }),
        );

        // Check if category exists, if not save it.
        const categories = await Promise.all(
            transactions.map(async transaction => {
                const category = await createCategory.execute({
                    title: (transaction.category as unknown) as string,
                });
                return category;
            }),
        );

        const transactionsToSave = transactions.map(
            ({ title, value, type }, index) => {
                const transaction = transactionsRepository.create({
                    title,
                    value,
                    type,
                    category: categories[index],
                });
                delete transaction.category.created_at;
                delete transaction.category.updated_at;
                return transaction;
            },
        );

        const transactionsSaved = await transactionsRepository.save(
            transactionsToSave,
        );

        return transactionsSaved;
    }
}
