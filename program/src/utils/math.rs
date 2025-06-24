use crate::JellybeanError;
use anchor_lang::prelude::*;

pub fn get_bps_of(amount: u64, bps: u16) -> Result<u64> {
    if bps == 0 || amount == 0 {
        return Ok(0);
    }

    let bps = bps as u128;
    let amount = amount as u128;
    let result = amount
        .checked_mul(bps)
        .ok_or(JellybeanError::NumericalOverflowError)?
        .checked_div(10000)
        .ok_or(JellybeanError::NumericalOverflowError)? as u64;
    Ok(result)
}
