import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for seeding');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type SeedCategory = {
  name: string;
  slug: string;
  description: string;
  parentSlug?: string;
};

// Predefined categories for the Kingdom Market marketplace.
// Slugs are stable identifiers — never change them once deployed.
const categories: SeedCategory[] = [
  { name: 'Food & Groceries', slug: 'food-groceries', description: 'Fresh produce, packaged foods, and groceries.' },
  { name: 'Fashion & Clothing', slug: 'fashion-clothing', description: 'Clothing, footwear, and accessories for all ages.' },
  { name: 'Electronics', slug: 'electronics', description: 'Phones, laptops, gadgets, and electronic accessories.' },
  { name: 'Health & Beauty', slug: 'health-beauty', description: 'Skincare, cosmetics, wellness products, and supplements.' },
  { name: 'Home & Furniture', slug: 'home-furniture', description: 'Furniture, appliances, and home decor.' },
  { name: 'Automotive', slug: 'automotive', description: 'Vehicles, spare parts, and auto services.' },
  { name: 'Real Estate', slug: 'real-estate', description: 'Properties for rent and sale.' },
  { name: 'Education & Training', slug: 'education-training', description: 'Tutoring, courses, and educational materials.' },
  { name: 'Tailoring & Fashion Design', slug: 'tailoring-fashion-design', description: 'Custom tailoring, alterations, and fashion design services.' },
  { name: 'Event Planning', slug: 'event-planning', description: 'Event planning, catering, and party rentals.' },
  { name: 'Hair & Beauty Services', slug: 'hair-beauty-services', description: 'Hairdressing, barbing, and beauty salon services.' },
  { name: 'Repairs & Maintenance', slug: 'repairs-maintenance', description: 'Repair services for electronics, appliances, and vehicles.' },
  { name: 'Transport & Logistics', slug: 'transport-logistics', description: 'Haulage, delivery, and moving services.' },
  { name: 'Professional Services', slug: 'professional-services', description: 'Legal, accounting, consulting, and other professional services.' },
  { name: 'Arts & Crafts', slug: 'arts-crafts', description: 'Handmade crafts, artwork, and creative products.' },
  { name: 'Agriculture', slug: 'agriculture', description: 'Farm produce, livestock, and agricultural inputs.' },
  { name: 'Sports & Fitness', slug: 'sports-fitness', description: 'Sporting goods, fitness equipment, and training services.' },
  { name: 'Baby & Kids', slug: 'baby-kids', description: 'Childrens clothing, toys, and baby essentials.' },
  { name: 'Phones & Tablets', slug: 'phones-tablets', description: 'Mobile phones, tablets, and accessories.' },
  { name: 'Computing', slug: 'computing', description: 'Laptops, desktops, and computer accessories.' },
  // Software Engineering and its sub-categories
  {
    name: 'Software Engineering',
    slug: 'software-engineering',
    description: 'Software development services, training, and solutions.',
  },
  {
    name: 'Mobile App Development',
    slug: 'mobile-app-development',
    description: 'Mobile application development for iOS, Android, and cross-platform.',
    parentSlug: 'software-engineering',
  },
  {
    name: 'Software Development Training',
    slug: 'software-development-training',
    description: 'Coding bootcamps, programming courses, and developer training programs.',
    parentSlug: 'software-engineering',
  },
  {
    name: 'Website Development',
    slug: 'website-development',
    description: 'Web design, development, and maintenance services.',
    parentSlug: 'software-engineering',
  },
];

async function main(): Promise<void> {
  console.info('Seeding categories…');

  // Seed parent categories first so children can link to them.
  const parents = categories.filter((c) => c.parentSlug === undefined);
  const children = categories.filter((c) => c.parentSlug !== undefined);

  for (const category of parents) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        parentId: null,
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        isActive: true,
      },
    });
  }

  for (const category of children) {
    const parent = await prisma.category.findUnique({
      where: { slug: category.parentSlug! },
    });
    if (!parent) {
      throw new Error(`Parent category "${category.parentSlug}" not found for "${category.slug}"`);
    }

    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        parentId: parent.id,
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        isActive: true,
        parentId: parent.id,
      },
    });
  }

  console.info(`Seeded ${categories.length} categories.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
