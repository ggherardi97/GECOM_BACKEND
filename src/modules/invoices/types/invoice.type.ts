import { Prisma } from '@prisma/client';

export type InvoiceWithLines = Prisma.invoicesGetPayload<{
  include: {
    invoice_lines: true;
    currencies: true;
    companies: true;
  };
}>;