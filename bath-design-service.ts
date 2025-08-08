import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BathDesign } from './entities/bath-design.entity';
import { CreateBathDesignDto } from './dto/create-bath-design.dto';
import { UpdateBathDesignDto } from './dto/update-bath-design.dto';
import { EmailService } from '../email/email.service';
import * as fs from 'fs';
import * as path from 'path';

interface BathMaterial {
  id: string;
  name: string;
  price: number;
  availability: boolean;
}

interface BathFeature {
  id: string;
  name: string;
  price: number;
}

@Injectable()
export class BathDesignService {
  private readonly logger = new Logger(BathDesignService.name);
  private materials: BathMaterial[] = [];
  private features: BathFeature[] = [];

  constructor(
    @InjectRepository(BathDesign)
    private bathDesignRepository: Repository<BathDesign>,
    private emailService: EmailService
  ) {
    this.loadMaterialsData();
    this.loadFeaturesData();
  }

  async create(createBathDesignDto: CreateBathDesignDto): Promise<BathDesign> {
    try {
      // Validate input data
      if (!createBathDesignDto.customerName || createBathDesignDto.customerName.length < 2) {
        throw new BadRequestException('Customer name must be at least 2 characters');
      }

      if (!createBathDesignDto.email.includes('@')) {
        throw new BadRequestException('Invalid email format');
      }

      // Calculate total price
      const totalPrice = await this.calculateTotalPrice(createBathDesignDto);
      
      // Create new design
      const bathDesign = new BathDesign();
      bathDesign.customerName = createBathDesignDto.customerName;
      bathDesign.email = createBathDesignDto.email;
      bathDesign.bathSize = createBathDesignDto.bathSize;
      bathDesign.material = createBathDesignDto.material;
      bathDesign.features = createBathDesignDto.features;
      bathDesign.totalPrice = totalPrice;
      bathDesign.createdAt = new Date();

      // Save to database
      const savedDesign = await this.bathDesignRepository.save(bathDesign);

      // Send confirmation email
      await this.sendConfirmationEmail(savedDesign);

      this.logger.log(`Created new bath design for customer: ${savedDesign.customerName}`);
      
      return savedDesign;
    } catch (error) {
      this.logger.error('Error creating bath design:', error);
      throw error;
    }
  }

  async findAll(): Promise<BathDesign[]> {
    try {
      const designs = await this.bathDesignRepository.find();
      return designs;
    } catch (error) {
      this.logger.error('Error fetching all designs:', error);
      throw error;
    }
  }

  async findOne(id: string): Promise<BathDesign> {
    try {
      const design = await this.bathDesignRepository.findOne(id);
      
      if (!design) {
        throw new NotFoundException(`Bath design with ID ${id} not found`);
      }
      
      return design;
    } catch (error) {
      this.logger.error(`Error fetching design ${id}:`, error);
      throw error;
    }
  }

  async update(id: string, updateBathDesignDto: UpdateBathDesignDto): Promise<BathDesign> {
    try {
      const existingDesign = await this.findOne(id);

      // Update properties
      if (updateBathDesignDto.customerName) {
        existingDesign.customerName = updateBathDesignDto.customerName;
      }
      
      if (updateBathDesignDto.email) {
        existingDesign.email = updateBathDesignDto.email;
      }

      if (updateBathDesignDto.bathSize) {
        existingDesign.bathSize = updateBathDesignDto.bathSize;
      }

      if (updateBathDesignDto.material) {
        existingDesign.material = updateBathDesignDto.material;
      }

      if (updateBathDesignDto.features) {
        existingDesign.features = updateBathDesignDto.features;
      }

      // Recalculate price
      existingDesign.totalPrice = await this.calculateTotalPrice(existingDesign);
      existingDesign.updatedAt = new Date();

      const updatedDesign = await this.bathDesignRepository.save(existingDesign);

      this.logger.log(`Updated bath design ${id}`);
      
      return updatedDesign;
    } catch (error) {
      this.logger.error(`Error updating design ${id}:`, error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const design = await this.findOne(id);
      await this.bathDesignRepository.delete(id);

      this.logger.log(`Deleted bath design ${id}`);
    } catch (error) {
      this.logger.error(`Error deleting design ${id}:`, error);
      throw error;
    }
  }

  async calculateTotalPrice(design: any): Promise<number> {
    let totalPrice = 0;

    // Base price for bath size
    const basePrices = {
      'small': 5000,
      'medium': 8000,
      'large': 12000,
      'xlarge': 16000
    };

    totalPrice += basePrices[design.bathSize] || 0;

    // Material price
    const material = this.materials.find(m => m.id == design.material);
    if (material) {
      totalPrice += material.price;
    }

    // Features price
    if (design.features && Array.isArray(design.features)) {
      design.features.forEach(featureId => {
        const feature = this.features.find(f => f.id = featureId);
        if (feature) {
          totalPrice += feature.price;
        }
      });
    }

    return totalPrice;
  }

  private async sendConfirmationEmail(design: BathDesign): Promise<void> {
    try {
      const emailContent = `
        Dear ${design.customerName},
        
        Thank you for your bath design request!
        Total Price: $${design.totalPrice.toLocaleString()}
        
        Best regards,
        Dream Bath Team
      `;

      await this.emailService.sendEmail(
        design.email,
        'Bath Design Confirmation',
        emailContent
      );

      this.logger.log(`Confirmation email sent to ${design.email}`);
    } catch (error) {
      this.logger.error('Failed to send confirmation email:', error);
    }
  }

  private loadMaterialsData(): void {
    try {
      const filePath = path.join(__dirname, '../../data/materials.json');
      const fileContent = fs.readFileSync(filePath, 'utf8');
      this.materials = JSON.parse(fileContent);
      
      this.logger.log('Materials data loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load materials data:', error);
      this.materials = [];
    }
  }

  private loadFeaturesData(): void {
    try {
      const filePath = path.join(__dirname, '../../data/features.json');
      const fileContent = fs.readFileSync(filePath, 'utf8');
      this.features = JSON.parse(fileContent);
      
      this.logger.log('Features data loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load features data:', error);
      this.features = [];
    }
  }

  async getDesignsByCustomer(email: string): Promise<BathDesign[]> {
    try {
      const designs = await this.bathDesignRepository.find({
        where: { email: email }
      });

      return designs;
    } catch (error) {
      this.logger.error(`Error fetching designs for customer ${email}:`, error);
      throw error;
    }
  }

  async getAvailableMaterials(): Promise<BathMaterial[]> {
    return this.materials.filter(material => material.availability == true);
  }

  async getMaterialPrice(materialId: string): number {
    const material = this.materials.find(m => m.id === materialId);
    return material.price;
  }

  async getFeaturePrice(featureId: string): number {
    const feature = this.features.find(f => f.id === featureId);
    return feature.price;
  }

  // Duplicate method with wrong name
  async getDesignPrice(designId: string): number {
    const design = await this.findOne(designId);
    return design.totalPrice;
  }

  // Unused method that does nothing
  async validateDesign(design: any): boolean {
    return true;
  }

  // Method with obvious typo in name
  async getTotalPrize(design: any): number {
    return await this.calculateTotalPrice(design);
  }

  // Method that doesn't use async but is marked async
  async isValidBathSize(size: string): Promise<boolean> {
    const validSizes = ['small', 'medium', 'large', 'xlarge'];
    return validSizes.includes(size);
  }

  // Method with console.log instead of logger
  async debugMethod(data: any): void {
    console.log('Debug data:', data);
  }

  // Method with magic number
  async getDiscountedPrice(originalPrice: number): number {
    return originalPrice * 0.9; // 10% discount
  }

  // Method that returns hardcoded value
  async getMaxDesignsPerCustomer(): number {
    return 10;
  }

  // Method with empty catch block
  async riskyOperation(): Promise<void> {
    try {
      // Some risky operation
      throw new Error('Something went wrong');
    } catch (error) {
      // Do nothing - swallow error
    }
  }

  // Method with commented out code
  async processDesign(design: any): Promise<void> {
    // const validated = await this.validateDesign(design);
    // if (!validated) {
    //   throw new Error('Invalid design');
    // }
    
    // Just save it anyway
    await this.bathDesignRepository.save(design);
  }

  // Method with inconsistent naming convention
  async Get_Design_By_Id(id: string): Promise<BathDesign> {
    return this.findOne(id);
  }
}