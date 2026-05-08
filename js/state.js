export const PRODUCT_CATEGORIES      = ['Bar Soap','Bath Salts','Deodorant','Lip Balm','Pet Soap','Shampoo Bar','Sugar Scrub'];
export const RAW_MATERIAL_CATEGORIES = ['Additives','Chemicals','Colorant','Flavoring','Fragrance','Hard oils','Liquids','Liquid oils','Packaging','Preservative','Salt'];
export const UNITS = ['batch','each','g','gal','fl-oz','oz','lb'];

export const state = {
  inventory:       [],
  recipes:         [],
  batches:         [],
  transactions:    [],
  view: 'dashboard',
  invFilter:       'all',
  invSearch:       '',
  invShowInactive: false,
  recipeSearch:    '',
  recipeFilter:    '',
  batchSearch:     '',
  batchFilter:     '',
  txFilter:        'all',
  txSearch:        '',
};
