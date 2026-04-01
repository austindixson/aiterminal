"""Strategy genome for evolutionary trading optimization.

Defines the StrategyGenome dataclass for encoding trading strategy parameters,
with methods for mutation, fitness computation, and backtesting.
"""
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

import numpy as np
from scipy.stats import norm

from config import CITIES
from backtester import FastBacktester

logger = logging.getLogger(__name__)


@dataclass
class StrategyGenome:
    """Genetic representation of a trading strategy."""
    
    # Core parameters
    metar_enabled: bool = True
    wind_enabled: bool = False
    temp_threshold: float = 2.0  # Temperature deviation threshold (°C)
    wind_threshold: float = 10.0  # Wind speed deviation threshold (km/h)
    humidity_threshold: float = 15.0  # Humidity deviation threshold (%)
    
    # Position sizing
    kelly_fraction: float = 0.5  # Fraction of Kelly criterion to use
    max_position: float = 100.0  # Max position size in USDC
    max_exposure: float = 500.0  # Max total exposure in USDC
    
    # Risk parameters
    stop_loss_pct: float = 0.3  # Stop loss percentage
    take_profit_pct: float = 0.5  # Take profit percentage
    
    # Market selection
    min_liquidity: float = 1000.0  # Minimum liquidity in USDC
    min_volume_24h: float = 500.0  # Minimum 24h volume in USDC
    
    # Timing parameters
    hours_before_end: int = 12  # Hours before market end to enter
    max_market_age_hours: int = 72  # Maximum market age in hours
    
    # Strategy weights (for multi-model scoring)
    metar_weight: float = 1.0
    wind_weight: float = 0.5
    temp_weight: float = 0.8
    
    # Mutation rate control
    mutation_rate: float = 0.15
    mutation_strength: float = 0.2
    
    # Internal tracking
    fitness: float = 0.0
    generation: int = 0
    backtest_start: Optional[str] = None
    backtest_end: Optional[str] = None
    trades_count: int = 0
    
    def __post_init__(self):
        """Validate and normalize genome parameters after initialization."""
        # Ensure probabilities and fractions are in valid ranges
        self.kelly_fraction = max(0.0, min(1.0, self.kelly_fraction))
        self.stop_loss_pct = max(0.01, min(0.95, self.stop_loss_pct))
        self.take_profit_pct = max(0.01, min(2.0, self.take_profit_pct))
        self.mutation_rate = max(0.01, min(1.0, self.mutation_rate))
        self.mutation_strength = max(0.01, min(1.0, self.mutation_strength))
        
        # Ensure weights are non-negative
        self.metar_weight = max(0.0, self.metar_weight)
        self.wind_weight = max(0.0, self.wind_weight)
        self.temp_weight = max(0.0, self.temp_weight)
        
        # Normalize weights if all positive
        total_weight = self.metar_weight + self.wind_weight + self.temp_weight
        if total_weight > 0:
            self.metar_weight /= total_weight
            self.wind_weight /= total_weight
            self.temp_weight /= total_weight
    
    def mutate(self) -> 'StrategyGenome':
        """Create a mutated copy of this genome."""
        import random
        
        new_params = {}
        
        # Mutate continuous parameters
        continuous_params = {
            'kelly_fraction': (0.0, 1.0),
            'max_position': (10.0, 1000.0),
            'max_exposure': (100.0, 5000.0),
            'stop_loss_pct': (0.01, 0.95),
            'take_profit_pct': (0.01, 2.0),
            'temp_threshold': (0.5, 10.0),
            'wind_threshold': (2.0, 30.0),
            'humidity_threshold': (5.0, 50.0),
            'metar_weight': (0.0, 2.0),
            'wind_weight': (0.0, 2.0),
            'temp_weight': (0.0, 2.0),
        }
        
        for param, (min_val, max_val) in continuous_params.items():
            if random.random() < self.mutation_rate:
                current = getattr(self, param)
                # Gaussian mutation with strength scaling
                mutation = random.gauss(0, self.mutation_strength * (max_val - min_val) / 2)
                new_val = current + mutation
                # Clamp to valid range
                new_val = max(min_val, min(max_val, new_val))
                new_params[param] = new_val
            else:
                new_params[param] = getattr(self, param)
        
        # Mutate boolean parameters
        if random.random() < self.mutation_rate:
            new_params['metar_enabled'] = not self.metar_enabled
        else:
            new_params['metar_enabled'] = self.metar_enabled
            
        if random.random() < self.mutation_rate:
            new_params['wind_enabled'] = not self.wind_enabled
        else:
            new_params['wind_enabled'] = self.wind_enabled
        
        # Mutate integer parameters
        if random.random() < self.mutation_rate:
            new_params['min_liquidity'] = max(100.0, self.min_liquidity * (1 + random.gauss(0, self.mutation_strength)))
        else:
            new_params['min_liquidity'] = self.min_liquidity
            
        if random.random() < self.mutation_rate:
            new_params['min_volume_24h'] = max(50.0, self.min_volume_24h * (1 + random.gauss(0, self.mutation_strength)))
        else:
            new_params['min_volume_24h'] = self.min_volume_24h
        
        if random.random() < self.mutation_rate:
            new_params['hours_before_end'] = max(1, min(48, int(self.hours_before_end * (1 + random.gauss(0, self.mutation_strength)))))
        else:
            new_params['hours_before_end'] = self.hours_before_end
        
        if random.random() < self.mutation_rate:
            new_params['max_market_age_hours'] = max(24, min(168, int(self.max_market_age_hours * (1 + random.gauss(0, self.mutation_strength)))))
        else:
            new_params['max_market_age_hours'] = self.max_market_age_hours
        
        # Create new genome with mutated parameters
        new_genome = StrategyGenome(
            metar_enabled=new_params['metar_enabled'],
            wind_enabled=new_params['wind_enabled'],
            temp_threshold=new_params['temp_threshold'],
            wind_threshold=new_params['wind_threshold'],
            humidity_threshold=new_params['humidity_threshold'],
            kelly_fraction=new_params['kelly_fraction'],
            max_position=new_params['max_position'],
            max_exposure=new_params['max_exposure'],
            stop_loss_pct=new_params['stop_loss_pct'],
            take_profit_pct=new_params['take_profit_pct'],
            min_liquidity=new_params['min_liquidity'],
            min_volume_24h=new_params['min_volume_24h'],
            hours_before_end=new_params['hours_before_end'],
            max_market_age_hours=new_params['max_market_age_hours'],
            metar_weight=new_params['metar_weight'],
            wind_weight=new_params['wind_weight'],
            temp_weight=new_params['temp_weight'],
            mutation_rate=self.mutation_rate,
            mutation_strength=self.mutation_strength,
            fitness=0.0,
            generation=self.generation + 1
        )
        
        # Normalize weights after mutation
        new_genome.__post_init__()
        
        return new_genome
    
    @staticmethod
    def crossover(parent1: 'StrategyGenome', parent2: 'StrategyGenome') -> 'StrategyGenome':
        """Create offspring by combining two parent genomes."""
        import random
        
        child_params = {}
        
        # Randomly select each parameter from either parent
        for field_name in StrategyGenome.__dataclass_fields__:
            if field_name in ('fitness', 'generation', 'backtest_start', 'backtest_end', 'trades_count'):
                continue
                
            val1 = getattr(parent1, field_name)
            val2 = getattr(parent2, field_name)
            
            # For boolean parameters, use simple crossover
            if isinstance(val1, bool):
                child_params[field_name] = val1 if random.random() < 0.5 else val2
            # For numeric parameters, use blend crossover
            elif isinstance(val1, (int, float)):
                # Simple blend: average with some randomization
                blend = random.random()
                if isinstance(val1, int):
                    child_params[field_name] = int(val1 * blend + val2 * (1 - blend))
                else:
                    child_params[field_name] = val1 * blend + val2 * (1 - blend)
            else:
                child_params[field_name] = val1 if random.random() < 0.5 else val2
        
        child = StrategyGenome(**child_params)
        child.__post_init__()
        
        return child
    
    def compute_fitness(self, backtest_results: Dict) -> float:
        """Compute fitness score from backtest results."""
        # Extract key metrics from backtest results
        trades = backtest_results.get('trades', [])
        if not trades:
            return 0.0
            
        # Calculate performance metrics
        net_profit = backtest_results.get('net_profit', 0)
        win_rate = backtest_results.get('win_rate', 0)
        max_drawdown = backtest_results.get('max_drawdown', 0)
        sharpe_ratio = backtest_results.get('sharpe_ratio', 0)
        
        # Fitness components (weighted)
        profit_component = net_profit  # Primary goal: maximize profit
        consistency_component = win_rate * 100  # Secondary: high win rate
        risk_component = 1.0 / (1.0 + max_drawdown) * 50  # Tertiary: minimize drawdown
        
        # Risk-adjusted return component
        if sharpe_ratio > 0:
            risk_adjusted_component = sharpe_ratio * 10
        else:
            risk_adjusted_component = 0
        
        # Total fitness: weighted combination
        fitness = (
            profit_component * 0.5 +
            consistency_component * 0.2 +
            risk_component * 0.15 +
            risk_adjusted_component * 0.15
        )
        
        # Apply exponential scaling for extreme values
        if fitness > 0:
            fitness = math.exp(math.log(fitness + 1) * 1.2) - 1
        elif fitness < 0:
            fitness = -math.exp(math.log(abs(fitness) + 1) * 1.2) + 1
        
        self.fitness = fitness
        return fitness
    
    def to_dict(self) -> Dict:
        """Convert genome to dictionary for JSON serialization."""
        return {
            'metar_enabled': self.metar_enabled,
            'wind_enabled': self.wind_enabled,
            'temp_threshold': self.temp_threshold,
            'wind_threshold': self.wind_threshold,
            'humidity_threshold': self.humidity_threshold,
            'kelly_fraction': self.kelly_fraction,
            'max_position': self.max_position,
            'max_exposure': self.max_exposure,
            'stop_loss_pct': self.stop_loss_pct,
            'take_profit_pct': self.take_profit_pct,
            'min_liquidity': self.min_liquidity,
            'min_volume_24h': self.min_volume_24h,
            'hours_before_end': self.hours_before_end,
            'max_market_age_hours': self.max_market_age_hours,
            'metar_weight': self.metar_weight,
            'wind_weight': self.wind_weight,
            'temp_weight': self.temp_weight,
            'mutation_rate': self.mutation_rate,
            'mutation_strength': self.mutation_strength,
            'fitness': self.fitness,
            'generation': self.generation,
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'StrategyGenome':
        """Create genome from dictionary."""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
    
    def save(self, filename: str = "best_genome.json"):
        """Save genome to JSON file."""
        with open(filename, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)
    
    @classmethod
    def load(cls, filename: str = "best_genome.json") -> 'StrategyGenome':
        """Load genome from JSON file."""
        with open(filename, 'r') as f:
            data = json.load(f)
        return cls.from_dict(data)

    def __post_init__(self):
        """Validate and initialize derived parameters."""
        # Ensure kelly_fraction is between 0 and 1
        self.kelly_fraction = max(0.0, min(1.0, self.kelly_fraction))
        
        # Ensure mutation parameters are valid
        self.mutation_rate = max(0.0, min(1.0, self.mutation_rate))
        self.mutation_strength = max(0.0, self.mutation_strength)
        
        # Validate position sizing constraints
        self.max_position = max(1.0, self.max_position)
        self.max_exposure = max(self.max_position, self.max_exposure)
        
        # Normalize strategy weights
        total_weight = self.metar_weight + self.wind_weight + self.temp_weight
        if total_weight > 0:
            self.metar_weight /= total_weight
            self.wind_weight /= total_weight
            self.temp_weight /= total_weight

    def mutate(self) -> 'StrategyGenome':
        """Create a mutated copy of this genome."""
        import random
        
        new_params = {}
        for field_name in self.__dataclass_fields__:
            value = getattr(self, field_name)
            
            # Skip internal tracking fields
            if field_name in ('fitness', 'generation', 'trades_count'):
                new_params[field_name] = value
                continue
                
            # Skip non-mutable fields
            if field_name in ('backtest_start', 'backtest_end'):
                new_params[field_name] = value
                continue
            
            # Apply mutation based on mutation_rate
            if random.random() < self.mutation_rate:
                if isinstance(value, bool):
                    # Flip boolean with 50% probability
                    new_params[field_name] = not value
                elif isinstance(value, float):
                    # Apply Gaussian perturbation for float parameters
                    mutation = random.gauss(0, self.mutation_strength)
                    new_value = value * (1 + mutation)
                    # Apply bounds
                    if field_name == 'kelly_fraction':
                        new_value = max(0.0, min(1.0, new_value))
                    elif field_name in ('temp_threshold', 'wind_threshold', 'humidity_threshold'):
                        new_value = max(0.1, new_value)
                    elif field_name == 'mutation_rate':
                        new_value = max(0.0, min(1.0, new_value))
                    elif field_name == 'mutation_strength':
                        new_value = max(0.0, new_value)
                    elif field_name == 'stop_loss_pct':
                        new_value = max(0.0, min(1.0, new_value))
                    elif field_name == 'take_profit_pct':
                        new_value = max(0.0, new_value)
                    elif field_name == 'min_liquidity':
                        new_value = max(0.0, new_value)
                    elif field_name == 'min_volume_24h':
                        new_value = max(0.0, new_value)
                    elif field_name == 'hours_before_end':
                        new_value = max(1, int(new_value))
                    elif field_name == 'max_market_age_hours':
                        new_value = max(1, int(new_value))
                    new_params[field_name] = new_value
                elif isinstance(value, int):
                    # Apply integer perturbation
                    mutation = int(random.gauss(0, self.mutation_strength * 10))
                    new_value = value + mutation
                    # Apply bounds
                    if field_name in ('hours_before_end', 'max_market_age_hours'):
                        new_value = max(1, new_value)
                    new_params[field_name] = new_value
                else:
                    new_params[field_name] = value
            else:
                new_params[field_name] = value
        
        return StrategyGenome(**new_params)

    @classmethod
    def crossover(cls, parent1: 'StrategyGenome', parent2: 'StrategyGenome') -> 'StrategyGenome':
        """Create a child genome from two parents using single-point crossover."""
        import random
        
        fields = list(cls.__dataclass_fields__.keys())
        child_params = {}
        
        # Select random crossover point
        crossover_point = random.randint(1, len(fields) - 1)
        
        for i, field_name in enumerate(fields):
            if field_name in ('fitness', 'generation', 'trades_count', 'backtest_start', 'backtest_end'):
                # Skip internal tracking fields
                child_params[field_name] = getattr(cls, field_name) if hasattr(cls, field_name) else 0
            elif i < crossover_point:
                child_params[field_name] = getattr(parent1, field_name)
            else:
                child_params[field_name] = getattr(parent2, field_name)
        
        return cls(**child_params)

    def compute_fitness(self, backtest_results: Dict) -> float:
        """Compute fitness score from backtest results."""
        # Base fitness on final equity
        final_equity = backtest_results.get('final_equity', 0)
        initial_equity = backtest_results.get('initial_equity', 1000)  # Default $1000
        
        # Calculate ROI
        roi = (final_equity - initial_equity) / initial_equity if initial_equity > 0 else -1
        
        # Add bonus for win rate
        win_rate = backtest_results.get('win_rate', 0.5)
        
        # Penalty for drawdown
        max_drawdown = backtest_results.get('max_drawdown', 0)
        
        # Calculate fitness score
        # Weighted combination of ROI, win rate, and drawdown penalty
        fitness = (
            final_equity * 10 +  # Primary factor: final equity
            roi * 100 +  # Secondary factor: ROI percentage
            win_rate * 50 -  # Tertiary factor: win rate
            max_drawdown * 100  # Penalty: drawdown
        )
        
        # Add bonus for consistent performance
        trades_count = backtest_results.get('trades_count', 0)
        if trades_count > 10:
            fitness *= 1.1  # 10% bonus for substantial trading
        
        return max(1.0, fitness)  # Ensure positive fitness

    def to_dict(self) -> Dict:
        """Convert genome to dictionary for serialization."""
        return {
            'metar_enabled': self.metar_enabled,
            'wind_enabled': self.wind_enabled,
            'temp_threshold': self.temp_threshold,
            'wind_threshold': self.wind_threshold,
            'humidity_threshold': self.humidity_threshold,
            'kelly_fraction': self.kelly_fraction,
            'max_position': self.max_position,
            'max_exposure': self.max_exposure,
            'stop_loss_pct': self.stop_loss_pct,
            'take_profit_pct': self.take_profit_pct,
            'min_liquidity': self.min_liquidity,
            'min_volume_24h': self.min_volume_24h,
            'hours_before_end': self.hours_before_end,
            'max_market_age_hours': self.max_market_age_hours,
            'metar_weight': self.metar_weight,
            'wind_weight': self.wind_weight,
            'temp_weight': self.temp_weight,
            'mutation_rate': self.mutation_rate,
            'mutation_strength': self.mutation_strength,
            'fitness': self.fitness,
            'generation': self.generation,
            'trades_count': self.trades_count,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'StrategyGenome':
        """Create genome from dictionary."""
        return cls(**data)

    def save(self, filepath: str):
        """Save genome to JSON file."""
        with open(filepath, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, filepath: str) -> 'StrategyGenome':
        """Load genome from JSON file."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return cls.from_dict(data)
    
    def __post_init__(self):
        """Validate and normalize parameters after initialization."""
        # Ensure kelly_fraction is between 0 and 1
        self.kelly_fraction = max(0.0, min(1.0, self.kelly_fraction))
        # Ensure thresholds are positive
        self.temp_threshold = max(0.0, self.temp_threshold)
        self.wind_threshold = max(0.0, self.wind_threshold)
        self.humidity_threshold = max(0.0, self.humidity_threshold)
        # Normalize weights
        total_weight = self.metar_weight + self.wind_weight + self.temp_weight
        if total_weight > 0:
            self.metar_weight /= total_weight
            self.wind_weight /= total_weight
            self.temp_weight /= total_weight
    
    def mutate(self) -> 'StrategyGenome':
        """Create a mutated copy of this genome."""
        import random
        mutation_rate = self.mutation_rate
        mutation_strength = self.mutation_strength
        
        new_params = {}
        for field_name in self.__dataclass_fields__:
            if field_name in ['fitness', 'generation', 'backtest_start', 'backtest_end', 'trades_count']:
                continue
                
            value = getattr(self, field_name)
            
            if isinstance(value, bool):
                if random.random() < mutation_rate:
                    new_params[field_name] = not value
            elif isinstance(value, float):
                if random.random() < mutation_rate:
                    change = (random.random() - 0.5) * 2 * mutation_strength
                    new_params[field_name] = max(0.0, min(1.0, value + change) if field_name in ['kelly_fraction', 'metar_weight', 'wind_weight', 'temp_weight', 'stop_loss_pct', 'take_profit_pct'] else value + change * (0.1 if 'threshold' in field_name else 10))
            elif isinstance(value, int):
                if random.random() < mutation_rate:
                    if field_name in ['hours_before_end', 'max_market_age_hours']:
                        new_params[field_name] = max(1, value + random.randint(-6, 6))
                    elif field_name in ['min_liquidity', 'min_volume_24h', 'max_position', 'max_exposure']:
                        new_params[field_name] = max(10, value + random.randint(-100, 100))
        
        return StrategyGenome(
            **{f: getattr(self, f) for f in self.__dataclass_fields__ if f not in new_params},
            **new_params,
            generation=self.generation + 1,
            fitness=0.0
        )
    
    @classmethod
    def crossover(cls, parent1: 'StrategyGenome', parent2: 'StrategyGenome') -> List['StrategyGenome']:
        """Create offspring by combining two parent genomes."""
        import random
        
        child1_params = {}
        child2_params = {}
        
        for field_name in parent1.__dataclass_fields__:
            if field_name in ['fitness', 'generation', 'backtest_start', 'backtest_end', 'trades_count']:
                continue
                
            p1_val = getattr(parent1, field_name)
            p2_val = getattr(parent2, field_name)
            
            if random.random() < 0.5:
                child1_params[field_name] = p1_val
                child2_params[field_name] = p2_val
            else:
                child1_params[field_name] = p2_val
                child2_params[field_name] = p1_val
        
        return [
            StrategyGenome(**child1_params, generation=parent1.generation + 1, fitness=0.0),
            StrategyGenome(**child2_params, generation=parent2.generation + 1, fitness=0.0)
        ]
    
    def to_dict(self) -> Dict:
        """Convert genome to dictionary for serialization."""
        return {
            'metar_enabled': self.metar_enabled,
            'wind_enabled': self.wind_enabled,
            'temp_threshold': self.temp_threshold,
            'wind_threshold': self.wind_threshold,
            'humidity_threshold': self.humidity_threshold,
            'kelly_fraction': self.kelly_fraction,
            'max_position': self.max_position,
            'max_exposure': self.max_exposure,
            'stop_loss_pct': self.stop_loss_pct,
            'take_profit_pct': self.take_profit_pct,
            'min_liquidity': self.min_liquidity,
            'min_volume_24h': self.min_volume_24h,
            'hours_before_end': self.hours_before_end,
            'max_market_age_hours': self.max_market_age_hours,
            'metar_weight': self.metar_weight,
            'wind_weight': self.wind_weight,
            'temp_weight': self.temp_weight,
            'mutation_rate': self.mutation_rate,
            'mutation_strength': self.mutation_strength,
            'fitness': self.fitness,
            'generation': self.generation
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'StrategyGenome':
        """Create genome from dictionary."""
        return cls(
            metar_enabled=data.get('metar_enabled', True),
            wind_enabled=data.get('wind_enabled', False),
            temp_threshold=data.get('temp_threshold', 2.0),
            wind_threshold=data.get('wind_threshold', 10.0),
            humidity_threshold=data.get('humidity_threshold', 15.0),
            kelly_fraction=data.get('kelly_fraction', 0.5),
            max_position=data.get('max_position', 100.0),
            max_exposure=data.get('max_exposure', 500.0),
            stop_loss_pct=data.get('stop_loss_pct', 0.3),
            take_profit_pct=data.get('take_profit_pct', 0.5),
            min_liquidity=data.get('min_liquidity', 1000.0),
            min_volume_24h=data.get('min_volume_24h', 500.0),
            hours_before_end=data.get('hours_before_end', 12),
            max_market_age_hours=data.get('max_market_age_hours', 72),
            metar_weight=data.get('metar_weight', 1.0),
            wind_weight=data.get('wind_weight', 0.5),
            temp_weight=data.get('temp_weight', 0.8),
            mutation_rate=data.get('mutation_rate', 0.15),
            mutation_strength=data.get('mutation_strength', 0.2),
            fitness=data.get('fitness', 0.0),
            generation=data.get('generation', 0)
        )
    
    def save(self, filepath: str):
        """Save genome to JSON file."""
        with open(filepath, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)
    
    @classmethod
    def load(cls, filepath: str) -> 'StrategyGenome':
        """Load genome from JSON file."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return cls.from_dict(data)
    
    def compute_fitness(self, backtest_results: Dict) -> float:
        """Compute fitness from backtest results."""
        # Primary metrics
        total_profit = backtest_results.get('total_profit', 0)
        win_rate = backtest_results.get('win_rate', 0.5)
        sharpe_ratio = backtest_results.get('sharpe_ratio', 0)
        max_drawdown = backtest_results.get('max_drawdown', 0)
        trades_count = backtest_results.get('trades_count', 0)
        
        # Calculate fitness score
        # Penalize high drawdowns and low win rates
        drawdown_penalty = max(0, max_drawdown - 0.15)
        win_rate_penalty = max(0, 0.45 - win_rate)
        
        # Combined fitness
        fitness = (
            total_profit * 1000 +
            win_rate * 50000 -
            drawdown_penalty * 100000 -
            win_rate_penalty * 50000 +
            sharpe_ratio * 10000 +
            min(trades_count * 100, 50000)  # Cap trade count contribution
        )
        
        return max(1e-9, fitness)  # Ensure positive for genetic algorithm
    
    def __hash__(self):
        """Generate hash for genome."""
        return hash((
            self.metar_enabled, self.wind_enabled, self.temp_threshold,
            self.wind_threshold, self.humidity_threshold, self.kelly_fraction,
            self.max_position, self.max_exposure, self.stop_loss_pct,
            self.take_profit_pct, self.min_liquidity, self.min_volume_24h,
            self.hours_before_end, self.max_market_age_hours,
            self.metar_weight, self.wind_weight, self.temp_weight
        ))
    win_rate: float = 0.0
    profit_factor: float = 0.0
    max_drawdown: float = 0.0
    
    def __post_init__(self):
        """Validate and initialize the genome."""
        # Ensure parameters are within reasonable bounds
        self.kelly_fraction = np.clip(self.kelly_fraction, 0.1, 1.0)
        self.max_position = max(self.max_position, 5.0)
        self.max_exposure = max(self.max_exposure, self.max_position)
        self.stop_loss_pct = np.clip(self.stop_loss_pct, 0.1, 0.8)
        self.take_profit_pct = np.clip(self.take_profit_pct, 0.2, 2.0)
    
    def to_dict(self) -> Dict:
        """Convert genome to dictionary for JSON serialization."""
        return {
            "metar_enabled": self.metar_enabled,
            "wind_enabled": self.wind_enabled,
            "temp_threshold": self.temp_threshold,
            "wind_threshold": self.wind_threshold,
            "humidity_threshold": self.humidity_threshold,
            "kelly_fraction": self.kelly_fraction,
            "max_position": self.max_position,
            "max_exposure": self.max_exposure,
            "stop_loss_pct": self.stop_loss_pct,
            "take_profit_pct": self.take_profit_pct,
            "min_liquidity": self.min_liquidity,
            "min_volume_24h": self.min_volume_24h,
            "hours_before_end": self.hours_before_end,
            "max_market_age_hours": self.max_market_age_hours,
            "metar_weight": self.metar_weight,
            "wind_weight": self.wind_weight,
            "temp_weight": self.temp_weight,
            "mutation_rate": self.mutation_rate,
            "mutation_strength": self.mutation_strength,
            "fitness": self.fitness,
            "generation": self.generation,
            "backtest_start": self.backtest_start,
            "backtest_end": self.backtest_end,
            "trades_count": self.trades_count,
            "win_rate": self.win_rate,
            "profit_factor": self.profit_factor,
            "max_drawdown": self.max_drawdown,
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> "StrategyGenome":
        """Create genome from dictionary."""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
    
    def mutate(self) -> "StrategyGenome":
        """Create mutated offspring genome."""
        import random
        
        mutated = StrategyGenome(
            metar_enabled=not self.metar_enabled if random.random() < 0.1 else self.metar_enabled,
            wind_enabled=not self.wind_enabled if random.random() < 0.1 else self.wind_enabled,
            temp_threshold=self._mutate_float(self.temp_threshold, 0.5, 5.0),
            wind_threshold=self._mutate_float(self.wind_threshold, 5.0, 30.0),
            humidity_threshold=self._mutate_float(self.humidity_threshold, 5.0, 50.0),
            kelly_fraction=self._mutate_float(self.kelly_fraction, 0.1, 1.0),
            max_position=self._mutate_float(self.max_position, 10.0, 500.0),
            max_exposure=self._mutate_float(self.max_exposure, 50.0, 2000.0),
            stop_loss_pct=self._mutate_float(self.stop_loss_pct, 0.1, 0.8),
            take_profit_pct=self._mutate_float(self.take_profit_pct, 0.2, 2.0),
            min_liquidity=self._mutate_float(self.min_liquidity, 500.0, 10000.0),
            min_volume_24h=self._mutate_float(self.min_volume_24h, 100.0, 5000.0),
            hours_before_end=self._mutate_int(self.hours_before_end, 1, 72),
            max_market_age_hours=self._mutate_int(self.max_market_age_hours, 12, 168),
            metar_weight=self._mutate_float(self.metar_weight, 0.1, 2.0),
            wind_weight=self._mutate_float(self.wind_weight, 0.1, 2.0),
            temp_weight=self._mutate_float(self.temp_weight, 0.1, 2.0),
            mutation_rate=self._mutate_float(self.mutation_rate, 0.05, 0.5),
            mutation_strength=self._mutate_float(self.mutation_strength, 0.05, 0.5),
        )
        mutated.generation = self.generation + 1
        return mutated
    
    def _mutate_float(self, value: float, min_val: float, max_val: float) -> float:
        """Mutate a float value within bounds."""
        import random
        if random.random() < self.mutation_rate:
            noise = np.random.normal(0, self.mutation_strength * value)
            return np.clip(value + noise, min_val, max_val)
        return value
    
    def _mutate_int(self, value: int, min_val: int, max_val: int) -> int:
        """Mutate an int value within bounds."""
        import random
        if random.random() < self.mutation_rate:
            noise = int(np.random.normal(0, self.mutation_strength * value))
            return max(min_val, min(max_val, value + noise))
        return value
    
    def crossover(self, other: "StrategyGenome") -> "StrategyGenome":
        """Create offspring by crossover with another genome."""
        import random
        
        child_data = {}
        for field_name in self.__dataclass_fields__:
            if field_name in ("fitness", "generation", "backtest_start", 
                            "backtest_end", "trades_count", "win_rate", 
                            "profit_factor", "max_drawdown"):
                continue  # Skip computed fields
            
            parent = random.choice([self, other])
            child_data[field_name] = getattr(parent, field_name)
        
        child = StrategyGenome(**child_data)
        child.mutation_rate = (self.mutation_rate + other.mutation_rate) / 2
        child.mutation_strength = (self.mutation_strength + other.mutation_strength) / 2
        child.generation = max(self.generation, other.generation) + 1
        
        return child
    
    def compute_fitness(self, backtest_results: Dict) -> float:
        """Compute fitness score from backtest results."""
        returns = backtest_results.get("returns", [])
        wins = backtest_results.get("wins", 0)
        losses = backtest_results.get("losses", 0)
        total_trades = wins + losses
        
        if total_trades == 0 or len(returns) == 0:
            return 1.0  # Neutral fitness for no trades
        
        # Calculate key metrics
        total_return = sum(returns)
        win_rate = wins / total_trades if total_trades > 0 else 0.5
        profit_factor = -total_return / losses if losses > 0 and total_return < 0 else (wins / losses if losses > 0 else wins)
        
        # Calculate maximum drawdown
        cumulative = np.cumsum(returns)
        peak = np.maximum.accumulate(cumulative)
        drawdown = (peak - cumulative) / (peak + 1e-8)
        max_dd = np.max(drawdown)
        
        # Fitness function combining multiple factors
        # Weight heavily on profit factor and win rate for stable strategies
        # Penalize large drawdowns heavily
        fitness = (
            (total_return + 100) *  # Base return
            (1 + win_rate * 2) *  # Win rate bonus
            (1 + profit_factor) *  # Profit factor bonus
            (1 - max_dd * 3)  # Drawdown penalty
        )
        
        # Exponential scaling to emphasize differences
        fitness = np.exp(fitness / 100) * 100
        
        # Store computed metrics
        self.fitness = fitness
        self.win_rate = win_rate
        self.profit_factor = profit_factor
        self.max_drawdown = max_dd
        self.trades_count = total_trades
        
        return fitness
    
    def save(self, path: str = "best_genome.json"):
        """Save genome to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)
    
    @classmethod
    def load(cls, path: str = "best_genome.json") -> "StrategyGenome":
        """Load genome from JSON file."""
        with open(path, "r") as f:
            data = json.load(f)
        return cls.from_dict(data)
    
    def get_strategy_name(self) -> str:
        """Generate a human-readable strategy name."""
        parts = []
        if self.metar_enabled:
            parts.append("METAR")
        if self.wind_enabled:
            parts.append("WIND")
        if not self.metar_enabled and not self.wind_enabled:
            parts.append("BASE")
        
        parts.append(f"K{int(self.kelly_fraction*100)}")
        parts.append(f"P{int(self.max_position)}")
        
        return "_".join(parts)


@dataclass
class ExperimentResult:
    """Result of a strategy evolution experiment."""
    generation: int
    best_genome: StrategyGenome
    population_stats: Dict[str, float]
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict:
        return {
            "generation": self.generation,
            "best_genome": self.best_genome.to_dict(),
            "population_stats": self.population_stats,
            "timestamp": self.timestamp,
        }
