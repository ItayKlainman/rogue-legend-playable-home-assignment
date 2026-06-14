const { logoOverlay, ...base } = require('./m6_board_victory_rollsSurvived.variant.js');
module.exports = { ...base, promoCode: { code: 'GEM1000', mode: 'countdown', countdownSec: 10, rewardName: 'Gem Pack', rewardImage: 'ShopItem_GemPack.webp' } };
