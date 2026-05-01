import { Operator } from '../data/operators';

export const getCardImagePath = (op: Operator): string => {
  if (op.class === 'Item' || op.class === 'Robot') {
     return `/Characters/TCG Card/${op.class}/${op.name}.png`;
  }
  return `/Characters/TCG Card/${op.class}/${op.rarity} Star/${op.name}.png`;
};

export const getSpriteImagePath = (op: Operator, view: 'Front' | 'Back'): string => {
  const sanitizedName = op.name.replace(/[()]/g, '');
  return `/Characters/Sprite/${op.class}/${sanitizedName} ${view}.png`;
};
