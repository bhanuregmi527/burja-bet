use anchor_lang::prelude::*;

declare_id!("4sXRvs4yxZFNi2enobw9eiM8G19igZ9D9j96P2ubN5hs");

// Deployer/Upgrade Authority - Only this address can initialize the contract
const DEPLOYER_AUTHORITY: &str = "DHRR5q8jo8cdMaHRwRzuFCUoSrhBwG1YqUGCrPg3Rp8Y";

#[program]
pub mod burja_bet {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        backend_signer: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.backend_signer = backend_signer;
        msg!("Vault initialized with authority: {:?}", vault.authority);
        msg!("Backend signer set to: {:?}", vault.backend_signer);
        Ok(())
    }

    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault.authority,
            BurjaBetError::Unauthorized
        );
        msg!("Depositing {} lamports into vault", amount);
        
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.authority.key(),
                &ctx.accounts.vault.key(),
                amount,
            ),
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        msg!("Deposit successful. New vault balance: {} lamports", ctx.accounts.vault.to_account_info().lamports());
        Ok(())
    }

    pub fn payout_winner(ctx: Context<PayoutWinner>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.backend_signer.key() == ctx.accounts.vault.backend_signer,
            BurjaBetError::Unauthorized
        );

        require!(
            ctx.accounts.vault.to_account_info().lamports() >= amount,
            BurjaBetError::InsufficientFunds
        );

        msg!("Paying out {} lamports to player: {:?}", amount, ctx.accounts.player.key());

        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += amount;

        msg!("Payout successful. Remaining vault balance: {} lamports", ctx.accounts.vault.to_account_info().lamports());
        Ok(())
    }

    pub fn user_deposit(ctx: Context<UserDeposit>, amount: u64) -> Result<()> {
        msg!("User {} depositing {} lamports", ctx.accounts.user.key(), amount);
        
        if ctx.accounts.user_balance.user == Pubkey::default() {
            ctx.accounts.user_balance.user = ctx.accounts.user.key();
            ctx.accounts.user_balance.amount = 0;
        } else {
            require!(
                ctx.accounts.user_balance.user == ctx.accounts.user.key(),
                BurjaBetError::Unauthorized
            );
        }
        
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.user.key(),
                &ctx.accounts.user_balance.key(),
                amount,
            ),
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.user_balance.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        ctx.accounts.user_balance.amount = ctx.accounts.user_balance.amount
            .checked_add(amount)
            .ok_or(BurjaBetError::Overflow)?;

        emit!(UserDepositEvent {
            user: ctx.accounts.user.key(),
            amount,
            new_balance: ctx.accounts.user_balance.amount,
        });

        msg!("Deposit successful. User balance: {} lamports", ctx.accounts.user_balance.amount);
        Ok(())
    }

    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault.authority,
            BurjaBetError::Unauthorized
        );

        require!(
            ctx.accounts.vault.to_account_info().lamports() >= amount,
            BurjaBetError::InsufficientFunds
        );

        msg!("Withdrawing {} lamports from vault", amount);

        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += amount;

        msg!("Withdrawal successful. Remaining vault balance: {} lamports", ctx.accounts.vault.to_account_info().lamports());
        Ok(())
    }
}

#[account]
pub struct Vault {
    pub authority: Pubkey,      
    pub backend_signer: Pubkey, 
}

impl Vault {
    pub const LEN: usize = 8 + 
                           32 + 
                           32;  
}

#[account]
pub struct UserBalance {
    pub user: Pubkey,   
    pub amount: u64,    
}

impl UserBalance {
    pub const LEN: usize = 8 + 
                           32 + 
                           8;  
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Vault::LEN,
        seeds = [b"vault"],
        bump,
        constraint = authority.key() == Pubkey::try_from(DEPLOYER_AUTHORITY).unwrap() @ BurjaBetError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayoutWinner<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Verified by access control check in instruction
    #[account(mut)]
    pub backend_signer: Signer<'info>,

    /// CHECK: The recipient player account (can be any valid account)
    #[account(mut)]
    pub player: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UserDeposit<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = UserBalance::LEN,
        seeds = [b"user_balance", user.key().as_ref()],
        bump
    )]
    pub user_balance: Account<'info, UserBalance>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump,
        constraint = vault.authority == authority.key() @ BurjaBetError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct UserDepositEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
}

#[error_code]
pub enum BurjaBetError {
    #[msg("Unauthorized: You do not have permission to perform this action")]
    Unauthorized,
    
    #[msg("Insufficient funds in the vault")]
    InsufficientFunds,
    
    #[msg("Arithmetic overflow occurred")]
    Overflow,
}
