pub mod checks;
pub mod math;
pub mod transfer;

pub use checks::*;
pub use math::*;
pub use transfer::*;

#[macro_export]
macro_rules! try_from {
    ($ty: ty, $acc: expr) => {
        <$ty>::try_from(unsafe { std::mem::transmute::<_, &AccountInfo<'_>>($acc.as_ref()) })
    };
}
